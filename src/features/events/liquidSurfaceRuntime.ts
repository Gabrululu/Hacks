import * as THREE from "three";

const simulationVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const simulationFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform vec2 uPointer;
  uniform float uImpact;
  uniform float uAspect;
  void main() {
    vec2 texel = vec2(uTexel.x * uAspect, uTexel.y);
    float center = texture2D(uState, vUv).r;
    float left = texture2D(uState, vUv - vec2(texel.x, 0.0)).r;
    float right = texture2D(uState, vUv + vec2(texel.x, 0.0)).r;
    float down = texture2D(uState, vUv - vec2(0.0, texel.y)).r;
    float up = texture2D(uState, vUv + vec2(0.0, texel.y)).r;
    float velocity = texture2D(uState, vUv).g;
    float laplacian = left + right + down + up - 4.0 * center;
    velocity = (velocity + laplacian * 0.23) * 0.986;
    float distanceToPointer = length((vUv - uPointer) * vec2(uAspect, 1.0));
    float drop = exp(-distanceToPointer * distanceToPointer * 900.0) * uImpact;
    velocity += drop;
    float pressure = (center + velocity) * 0.997;
    float gx = right - left;
    float gy = up - down;
    gl_FragColor = vec4(pressure, velocity, gx, gy);
  }
`;

const displayFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform sampler2D uImage;
  uniform vec2 uViewSize;
  uniform vec2 uImageSize;
  uniform float uIntensity;
  uniform float uHasImage;
  vec2 coverUv(vec2 uv) {
    float viewAspect = uViewSize.x / max(uViewSize.y, 1.0);
    float imageAspect = uImageSize.x / max(uImageSize.y, 1.0);
    vec2 result = uv;
    if (viewAspect > imageAspect) {
      float scale = imageAspect / viewAspect;
      result.y = (uv.y - 0.5) * scale + 0.5;
    } else {
      float scale = viewAspect / imageAspect;
      result.x = (uv.x - 0.5) * scale + 0.5;
    }
    return result;
  }
  void main() {
    vec4 wave = texture2D(uState, vUv);
    vec2 uv = coverUv(vUv);
    vec2 normal = wave.ba;
    uv += normal * (0.035 * uIntensity);
    vec3 color = texture2D(uImage, clamp(uv, 0.001, 0.999)).rgb;
    float light = pow(max(0.0, dot(normalize(vec3(normal * 18.0, 1.0)), normalize(vec3(-0.42, 0.55, 0.72)))), 28.0);
    float crest = smoothstep(0.012, 0.045, abs(wave.r)) * 0.10;
    color += vec3(0.58, 0.91, 0.39) * light * (0.22 + uIntensity * 0.34);
    color += vec3(0.12, 0.22, 0.08) * crest * uIntensity;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function createFallbackTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(850, 270, 20, 850, 270, 650);
  gradient.addColorStop(0, "#20391c");
  gradient.addColorStop(0.44, "#101a10");
  gradient.addColorStop(1, "#050705");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 14; i++) {
    context.beginPath();
    context.ellipse(880, 370, 180 + i * 55, 35 + i * 13, -0.2, 0, Math.PI * 2);
    context.strokeStyle = `rgba(190, 246, 133, ${0.018 + i * 0.001})`;
    context.lineWidth = 1;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, width: canvas.width, height: canvas.height };
}

export function mountLiquidSurface(
  root: HTMLElement,
  src: string | undefined,
  getIntensity: () => number,
  onContextRestore: () => void,
) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: "low-power" });
  } catch {
    return () => {};
  }
  const gl = renderer.getContext();
  if (!renderer.capabilities.isWebGL2 || !gl.getExtension("EXT_color_buffer_float")) {
    renderer.dispose();
    return () => {};
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x050705, 1);
  renderer.domElement.className = "liquid-simulation-canvas";
  root.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(2, 2);
  const stateTargets = [0, 1].map(() => new THREE.WebGLRenderTarget(256, 144, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }));
  stateTargets.forEach((target) => {
    target.texture.generateMipmaps = false;
    renderer.setRenderTarget(target);
    renderer.clear(true, false, false);
  });
  renderer.setRenderTarget(null);
  const simulationUniforms = {
    uState: { value: stateTargets[0].texture },
    uTexel: { value: new THREE.Vector2(1 / 256, 1 / 144) },
    uPointer: { value: new THREE.Vector2(-10, -10) },
    uImpact: { value: 0 },
    uAspect: { value: 1 },
  };
  const simulationMaterial = new THREE.ShaderMaterial({ uniforms: simulationUniforms, vertexShader: simulationVertex, fragmentShader: simulationFragment });
  const simulationScene = new THREE.Scene();
  simulationScene.add(new THREE.Mesh(geometry, simulationMaterial));
  const screenMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uState: { value: stateTargets[0].texture },
      uImage: { value: null },
      uViewSize: { value: new THREE.Vector2(1, 1) },
      uImageSize: { value: new THREE.Vector2(1280, 720) },
      uIntensity: { value: 0.45 },
      uHasImage: { value: src ? 1 : 0 },
    },
    vertexShader: simulationVertex,
    fragmentShader: displayFragment,
  });
  const screenScene = new THREE.Scene();
  screenScene.add(new THREE.Mesh(geometry, screenMaterial));
  const camera = new THREE.Camera();
  let imageTexture: THREE.Texture;
  let imageReady = !src;
  let imageDimensions = { width: 1280, height: 720 };
  if (src) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    imageTexture = loader.load(src, (texture) => {
      if (destroyed) return;
      imageReady = true;
      const image = texture.image as { width?: number; height?: number };
      imageDimensions = { width: image.width || 1280, height: image.height || 720 };
      screenMaterial.uniforms.uImageSize.value.set(imageDimensions.width, imageDimensions.height);
      root.querySelector("img")?.classList.add("is-hidden");
    }, undefined, () => { screenMaterial.uniforms.uHasImage.value = 0; });
    imageTexture.colorSpace = THREE.SRGBColorSpace;
  } else {
    const fallback = createFallbackTexture();
    imageTexture = fallback.texture;
    imageDimensions = fallback;
  }
  screenMaterial.uniforms.uImage.value = imageTexture;

  let activeTarget = 0;
  let frame = 0;
  let raf = 0;
  let impact = 0;
  let visible = true;
  let destroyed = false;
  let lastPointer = 0;
  let bounds: DOMRect | undefined;
  let currentWidth = 0;
  let currentHeight = 0;
  const resize = () => {
    const rect = root.getBoundingClientRect();
    bounds = rect;
    if (!rect.width || !rect.height) return;
    currentWidth = rect.width;
    currentHeight = rect.height;
    renderer.setSize(rect.width, rect.height, false);
    screenMaterial.uniforms.uViewSize.value.set(rect.width, rect.height);
    simulationUniforms.uAspect.value = rect.width / rect.height;
    const simWidth = Math.min(512, Math.max(192, Math.round(rect.width * 0.42)));
    const simHeight = Math.min(288, Math.max(108, Math.round(rect.height * 0.42)));
    stateTargets.forEach((target) => target.setSize(simWidth, simHeight));
    simulationUniforms.uTexel.value.set(1 / simWidth, 1 / simHeight);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  const point = (x: number, y: number, strength: number) => {
    if (!bounds) bounds = root.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
    const u = (x - bounds.left) / Math.max(bounds.width, 1);
    const v = 1 - (y - bounds.top) / Math.max(bounds.height, 1);
    simulationUniforms.uPointer.value.set(u, v);
    impact = Math.min(1.25, impact + strength);
    lastPointer = frame;
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    point(event.clientX, event.clientY, 0.12);
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === "touch" || matchMedia("(pointer: coarse)").matches)
      point(event.clientX, event.clientY, 0.9);
  };
  const onScroll = () => { bounds = undefined; };
  const onVisibility = () => { visible = !document.hidden; if (visible && !raf) raf = requestAnimationFrame(render); };
  const onLost = (event: Event) => { event.preventDefault(); renderer.domElement.classList.remove("is-ready"); };
  const onRestored = () => { onContextRestore(); };
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  document.addEventListener("visibilitychange", onVisibility);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  renderer.domElement.addEventListener("webglcontextrestored", onRestored);

  const render = () => {
    raf = 0;
    if (destroyed || !visible || !currentWidth || !currentHeight) return;
    frame++;
    // Slow, restrained drops keep the surface alive when the pointer is idle.
    if (frame % 105 === 0 && frame - lastPointer > 85) {
      simulationUniforms.uPointer.value.set(0.55 + Math.sin(frame) * 0.23, 0.5 + Math.cos(frame * 0.7) * 0.2);
      impact = 0.22;
    }
    const nextTarget = 1 - activeTarget;
    simulationUniforms.uState.value = stateTargets[activeTarget].texture;
    simulationUniforms.uImpact.value = impact;
    renderer.setRenderTarget(stateTargets[nextTarget]);
    renderer.render(simulationScene, camera);
    renderer.setRenderTarget(null);
    activeTarget = nextTarget;
    screenMaterial.uniforms.uState.value = stateTargets[activeTarget].texture;
    screenMaterial.uniforms.uIntensity.value = Math.max(0, Math.min(1, getIntensity()));
    renderer.render(screenScene, camera);
    if (imageReady && !renderer.domElement.classList.contains("is-ready")) {
      renderer.domElement.classList.add("is-ready");
      root.querySelector("img")?.classList.add("is-hidden");
      root.querySelector(".water-static-background")?.classList.add("is-hidden");
    }
    impact *= 0.88;
    raf = requestAnimationFrame(render);
  };
  resize();
  raf = requestAnimationFrame(render);

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("visibilitychange", onVisibility);
    renderer.domElement.removeEventListener("webglcontextlost", onLost);
    renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
    imageTexture.dispose();
    stateTargets.forEach((target) => target.dispose());
    geometry.dispose();
    simulationMaterial.dispose();
    screenMaterial.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}

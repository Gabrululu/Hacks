import { useEffect, useRef, useState } from "react";

type WaterRippleBackgroundProps = {
  src?: string;
  intensity?: number;
  alt: string;
  className?: string;
};

export function WaterRippleBackground({
  src,
  intensity = 0.45,
  alt,
  className = "",
}: WaterRippleBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef(intensity);
  const [generation, setGeneration] = useState(0);
  intensityRef.current = intensity;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("./liquidSurfaceRuntime").then(({ mountLiquidSurface }) => {
      if (cancelled) return;
      dispose = mountLiquidSurface(root, src, () => intensityRef.current, () =>
        setGeneration((value) => value + 1),
      );
    }).catch(() => {
      // The static image remains visible when WebGL is unavailable.
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [src, generation]);

  return (
    <div
      ref={rootRef}
      className={`event-water-bg ${className}`.trim()}
      aria-hidden="true"
    >
      {src ? <img src={src} alt={alt} /> : <div className="water-static-background" />}
    </div>
  );
}

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export type CardPalette = {
  background: string;
  surface: string;
  text: string;
  primary: string;
  accent: string;
};

export type CardProject = {
  title: string;
  team: string;
  summary: string;
  logoUrl?: string | null;
  links?: { label: string; url: string }[];
};

export type SocialCardData = {
  eventName: string;
  eventTagline?: string;
  roleLabel?: string;
  participatingLabel?: string;
  projectLabel?: string;
  readyLabel?: string;
  brandLabel?: string;
  footerLabel?: string;
  displayName?: string;
  photoUrl?: string | null;
  eventLogoUrl?: string | null;
  templateId?: string;
  palette: CardPalette;
  project?: CardProject;
};

const WIDTH = 1200;
const HEIGHT = 630;
function loadImage(url?: string | null) {
  if (!url) return Promise.resolve(null);
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function setFill(ctx: CanvasRenderingContext2D, value: string) {
  ctx.fillStyle = value;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = word;
      if (lines >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines < maxLines && line) ctx.fillText(line, x, y + lines * lineHeight);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
  ctx.restore();
}

function drawCard(
  canvas: HTMLCanvasElement,
  data: SocialCardData,
  photo: HTMLImageElement | null,
  eventLogo: HTMLImageElement | null,
  projectLogo: HTMLImageElement | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = data.palette;
  const project = data.project;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  setFill(ctx, palette.background);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (data.templateId === "signal") {
    ctx.save();
    ctx.globalAlpha = 0.13;
    setFill(ctx, palette.accent);
    for (let x = 780; x < 1260; x += 52) {
      ctx.fillRect(x, 0, 8, HEIGHT);
    }
    ctx.restore();
  } else if (data.templateId === "orbit") {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    for (let size = 260; size < 560; size += 62) {
      ctx.beginPath();
      ctx.ellipse(1030, 315, size, size * 0.56, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  setFill(ctx, palette.primary);
  ctx.fillRect(0, 0, 14, HEIGHT);
  if (eventLogo) drawImageCover(ctx, eventLogo, 72, 56, 68, 68, 12);
  ctx.fillStyle = palette.text;
  ctx.font = "600 23px Inter, Arial, sans-serif";
  ctx.fillText(data.eventName.slice(0, 54), eventLogo ? 160 : 72, 91);
  if (data.eventTagline) {
    ctx.globalAlpha = 0.68;
    ctx.font = "400 16px Inter, Arial, sans-serif";
    ctx.fillText(data.eventTagline.slice(0, 88), eventLogo ? 160 : 72, 120);
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 0.72;
  ctx.fillStyle = palette.text;
  ctx.font = "500 15px ui-monospace, SFMono-Regular, monospace";
  ctx.fillText(
    project
      ? (data.projectLabel ?? "PROJECT BUILT AT")
      : (data.participatingLabel ?? "PARTICIPATING IN"),
    76,
    205,
  );
  ctx.globalAlpha = 1;

  if (project) {
    const image = projectLogo;
    if (image) {
      drawImageCover(ctx, image, 76, 250, 206, 206, 22);
    } else {
      setFill(ctx, palette.surface);
      ctx.beginPath();
      ctx.roundRect(76, 250, 206, 206, 22);
      ctx.fill();
      ctx.fillStyle = palette.primary;
      ctx.font = "700 68px Inter, Arial, sans-serif";
      ctx.fillText(
        project.title.trim().slice(0, 1).toUpperCase() || "✳",
        146,
        378,
      );
    }
    ctx.fillStyle = palette.text;
    ctx.font = "650 48px Inter, Arial, sans-serif";
    drawWrappedText(ctx, project.title, 324, 306, 780, 58, 2);
    ctx.globalAlpha = 0.74;
    ctx.font = "500 22px Inter, Arial, sans-serif";
    ctx.fillText(project.team.slice(0, 74), 324, 390);
    ctx.font = "400 18px Inter, Arial, sans-serif";
    drawWrappedText(ctx, project.summary, 324, 434, 760, 28, 3);
    if (project.links?.length) {
      const labels = project.links.map((link) => link.label).join("   ·   ");
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.primary;
      ctx.font = "600 17px Inter, Arial, sans-serif";
      ctx.fillText(labels.slice(0, 92), 324, 554);
    }
  } else {
    ctx.fillStyle = palette.text;
    ctx.font = "650 57px Inter, Arial, sans-serif";
    drawWrappedText(ctx, data.roleLabel ?? "HACKER", 76, 278, 720, 68, 2);
    ctx.globalAlpha = 0.72;
    ctx.font = "400 23px Inter, Arial, sans-serif";
    ctx.fillText(data.readyLabel ?? "READY TO BUILD", 76, 426);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.primary;
    ctx.font = "600 24px Inter, Arial, sans-serif";
    ctx.fillText((data.displayName || "Hacker").slice(0, 48), 76, 496);
    if (photo) {
      drawImageCover(ctx, photo, 860, 184, 264, 312, 132);
    } else {
      setFill(ctx, palette.surface);
      ctx.beginPath();
      ctx.roundRect(860, 184, 264, 312, 132);
      ctx.fill();
      ctx.fillStyle = palette.primary;
      ctx.font = "600 92px Inter, Arial, sans-serif";
      ctx.fillText(
        (data.displayName || "H").trim().slice(0, 1).toUpperCase(),
        954,
        366,
      );
    }
  }

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = palette.text;
  ctx.font = "400 14px ui-monospace, SFMono-Regular, monospace";
  ctx.fillText(data.brandLabel ?? "HACKS", 76, 590);
  ctx.fillText(data.footerLabel ?? "IDEA  →  BUILD  →  IMPACT", 902, 590);
  ctx.globalAlpha = 1;
}

export function SocialCardCanvas({
  data,
  canvasRef,
  className,
}: {
  data: SocialCardData;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  className?: string;
}) {
  const localRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? localRef;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    void Promise.all([
      loadImage(data.photoUrl),
      loadImage(data.eventLogoUrl),
      loadImage(data.project?.logoUrl),
    ]).then(([photo, eventLogo, projectLogo]) => {
      if (!cancelled) drawCard(canvas, data, photo, eventLogo, projectLogo);
    });
    return () => {
      cancelled = true;
    };
  }, [data, ref]);

  return (
    <canvas
      ref={ref}
      className={className}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`${data.eventName} ${data.project?.title ?? data.roleLabel ?? "card"}`}
    />
  );
}

export function socialCardPng(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("CARD_EXPORT_FAILED"));
        return;
      }
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}

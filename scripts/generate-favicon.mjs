import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const accent = [214, 255, 223];
const core = [184, 232, 205];
const background = [7, 11, 8];
const rays = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI * i) / 4;
  return {
    x1: 24 + Math.cos(angle) * 2.4,
    y1: 24 + Math.sin(angle) * 2.4,
    x2: 24 + Math.cos(angle) * 17.5,
    y2: 24 + Math.sin(angle) * 17.5,
  };
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function distanceToSegment(x, y, ray) {
  const dx = ray.x2 - ray.x1;
  const dy = ray.y2 - ray.y1;
  const t = Math.max(0, Math.min(1, ((x - ray.x1) * dx + (y - ray.y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ray.x1 - t * dx, y - ray.y1 - t * dy);
}

function renderPng(size, previewPath) {
  const samples = 8;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const scale = 48 / size;
  const radius = 12;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) / samples) * scale;
          const py = (y + (sy + 0.5) / samples) * scale;
          const qx = Math.max(radius, Math.min(48 - radius, px));
          const qy = Math.max(radius, Math.min(48 - radius, py));
          const inside = Math.hypot(px - qx, py - qy) <= radius;
          if (!inside) continue;
          let color = background;
          if (Math.hypot(px - 24, py - 24) <= 2.8) color = core;
          else if (rays.some((ray) => distanceToSegment(px, py, ray) <= 1.6)) color = accent;
          red += color[0];
          green += color[1];
          blue += color[2];
          alpha++;
        }
      }
      const count = samples * samples;
      const at = row + 1 + x * 4;
      raw[at] = Math.round(red / count);
      raw[at + 1] = Math.round(green / count);
      raw[at + 2] = Math.round(blue / count);
      raw[at + 3] = Math.round((alpha / count) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND"),
  ]);
  if (previewPath) writeFileSync(previewPath, png);
  return png;
}

const sizes = [16, 32, 48];
const images = sizes.map((size) => renderPng(size, size === 48 ? "/tmp/hacks-favicon-preview.png" : undefined));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync("public/favicon.ico", Buffer.concat([header, ...images]));

import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MARK = join(ROOT, "mobile", "assets", "logo-mark.png");

function bgSvg(size) {
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="44%" r="70%">
      <stop offset="0%" stop-color="#163a66"/>
      <stop offset="45%" stop-color="#0c1a32"/>
      <stop offset="100%" stop-color="#020408"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
</svg>`);
}

async function resizedMark(scale, size) {
  const target = Math.round(size * scale);
  return sharp(MARK).resize(target, target, { fit: "inside" }).png().toBuffer();
}

async function markPlacement(size, markBuf) {
  const meta = await sharp(markBuf).metadata();
  return {
    left: Math.round((size - meta.width) / 2),
    top: Math.round((size - meta.height) / 2),
    width: meta.width,
    height: meta.height,
  };
}

async function glowLayer(markBuf, blur) {
  return sharp(markBuf)
    .ensureAlpha()
    .tint({ r: 46, g: 230, b: 255 })
    .blur(blur)
    .toBuffer();
}

async function makeFilledIcon(size, scale, outPath) {
  const markBuf = await resizedMark(scale, size);
  const { left, top } = await markPlacement(size, markBuf);
  const blur = Math.max(3, Math.round(size / 90));
  const glow = await glowLayer(markBuf, blur);

  await sharp(bgSvg(size))
    .composite([
      { input: glow, left, top, blend: "screen" },
      { input: markBuf, left, top },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`Wrote ${outPath} (${size}px)`);
}

async function makeAdaptiveForeground(size, outPath) {
  const markBuf = await resizedMark(0.52, size);
  const { left, top } = await markPlacement(size, markBuf);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: markBuf, left, top }])
    .png()
    .toFile(outPath);
  console.log(`Wrote ${outPath} (adaptive)`);
}

const jobs = [
  [join(ROOT, "mobile", "assets", "icon.png"), 1024, 0.56, "filled"],
  [join(ROOT, "mobile", "assets", "adaptive-icon.png"), 1024, 0.52, "adaptive"],
  [join(ROOT, "mobile", "assets", "splash-icon.png"), 512, 0.44, "filled"],
  [join(ROOT, "backend", "app", "static", "apple-touch-icon.png"), 180, 0.6, "filled"],
  [join(ROOT, "backend", "app", "static", "icon-192.png"), 192, 0.58, "filled"],
  [join(ROOT, "backend", "app", "static", "icon-512.png"), 512, 0.56, "filled"],
  [join(ROOT, "backend", "app", "static", "favicon.png"), 32, 0.72, "filled"],
  [join(ROOT, "web-dashboard", "public", "apple-touch-icon.png"), 180, 0.6, "filled"],
  [join(ROOT, "web-dashboard", "public", "icon-192.png"), 192, 0.58, "filled"],
  [join(ROOT, "web-dashboard", "public", "icon-512.png"), 512, 0.56, "filled"],
  [join(ROOT, "web-dashboard", "public", "favicon.png"), 32, 0.72, "filled"],
];

for (const [outPath, size, scale, kind] of jobs) {
  if (kind === "adaptive") {
    await makeAdaptiveForeground(size, outPath);
  } else {
    await makeFilledIcon(size, scale, outPath);
  }
}

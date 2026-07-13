import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOGO = join(ROOT, "web-dashboard", "public", "brand", "logo.png");
const TARGET = 512;

const MARK_SVG = Buffer.from(`<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rg" x1="18%" y1="8%" x2="88%" y2="92%">
      <stop offset="0%" stop-color="#7dffc8"/>
      <stop offset="42%" stop-color="#3dffa8"/>
      <stop offset="100%" stop-color="#128a58"/>
    </linearGradient>
  </defs>
  <g transform="translate(72, 64) scale(0.72)">
    <path fill="url(#rg)" d="M118 96 L248 96 L318 168 L318 228 L268 228 L268 196 L168 196 L168 416 L118 416 Z"/>
    <path fill="url(#rg)" d="M268 228 L318 228 L398 416 L342 416 L278 284 L268 284 Z"/>
    <path fill="#9dffda" opacity="0.9" d="M118 96 L168 96 L168 196 L118 196 Z"/>
  </g>
</svg>`);

const MARK_PATHS = [
  join(ROOT, "mobile", "assets", "logo-mark.png"),
  join(ROOT, "backend", "app", "static", "logo-mark.png"),
  join(ROOT, "web-dashboard", "public", "brand", "logo-mark.png"),
];

async function findGreenIconBounds() {
  const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;

  const isGreen = (r, g, b, a) => a > 10 && g > 20 && g > r && g > b;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (isGreen(r, g, b, a)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX) return null;

  // Ignore wordmark to the right — keep only the icon column cluster.
  const iconMaxX = Math.min(
    maxX,
    minX + Math.round((maxY - minY + 1) * 1.05),
  );

  return { minX, minY, maxX: iconMaxX, maxY };
}

async function centerOnCanvas(inputBuf, size = TARGET) {
  const meta = await sharp(inputBuf).metadata();
  const scale = Math.min((size * 0.46) / meta.width, (size * 0.56) / meta.height);
  const w = Math.max(1, Math.round(meta.width * scale));
  const h = Math.max(1, Math.round(meta.height * scale));
  const resized = await sharp(inputBuf).resize(w, h, { fit: "fill" }).png().toBuffer();
  const left = Math.floor((size - w) / 2);
  const top = Math.floor((size - h) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

async function fromLogoCrop() {
  const bounds = await findGreenIconBounds();
  if (!bounds) throw new Error("Green icon not found in logo.png");

  const pad = 14;
  const left = Math.max(0, bounds.minX - pad);
  const top = Math.max(0, bounds.minY - pad);
  const right = Math.min((await sharp(LOGO).metadata()).width - 1, bounds.maxX + pad);
  const bottom = Math.min((await sharp(LOGO).metadata()).height - 1, bounds.maxY + pad);
  const iconW = right - left + 1;
  const iconH = bottom - top + 1;

  const iconBuf = await sharp(LOGO)
    .extract({
      left,
      top,
      width: iconW,
      height: iconH,
    })
    .extend({
      top: 40,
      bottom: 40,
      left: 160,
      right: 28,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return centerOnCanvas(iconBuf);
}

async function main() {
  let markBuf;
  try {
    markBuf = await fromLogoCrop();
  } catch {
    markBuf = await sharp(MARK_SVG).png().toBuffer();
  }

  for (const out of MARK_PATHS) {
    await sharp(markBuf).png({ compressionLevel: 9 }).toFile(out);
    console.log(`Wrote ${out}`);
  }
}

main();

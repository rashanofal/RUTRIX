import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOGO = join(ROOT, "web-dashboard", "public", "brand", "logo.png");

const MARK_SVG = Buffer.from(`<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rg" x1="18%" y1="8%" x2="88%" y2="92%">
      <stop offset="0%" stop-color="#7dffc8"/>
      <stop offset="42%" stop-color="#3dffa8"/>
      <stop offset="100%" stop-color="#128a58"/>
    </linearGradient>
  </defs>
  <g transform="translate(64, 56) scale(0.76)">
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

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 10 && g > 80 && g > r + 20) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX) return null;
  return { minX, minY, maxX, maxY };
}

async function fromLogoCrop() {
  const bounds = await findGreenIconBounds();
  if (!bounds) throw new Error("Green icon not found in logo.png");

  const pad = 24;
  const left = Math.max(0, bounds.minX - pad);
  const top = Math.max(0, bounds.minY - pad);
  const width = bounds.maxX - bounds.minX + 1 + pad * 2;
  const height = bounds.maxY - bounds.minY + 1 + pad * 2;
  const side = Math.max(width, height);

  return sharp(LOGO)
    .extract({ left, top, width: side, height: side })
    .extend({
      top: 44,
      bottom: 44,
      left: 44,
      right: 44,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
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

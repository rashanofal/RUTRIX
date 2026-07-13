import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOGO = join(ROOT, "web-dashboard", "public", "brand", "logo.png");

/** Fallback SVG if logo.png is missing. */
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

async function fromLogoCrop() {
  const meta = await sharp(LOGO).metadata();
  const w = meta.width;
  const h = meta.height;
  const cropW = Math.round(w * 0.27);
  return sharp(LOGO)
    .extract({ left: 0, top: 0, width: cropW, height: h })
    .extend({
      top: 28,
      bottom: 28,
      left: 28,
      right: 28,
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

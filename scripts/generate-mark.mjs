import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOGO = join(ROOT, "logo.png");

/** Clean angular R mark — readable at 32px, no stray artifacts. */
const MARK_SVG = Buffer.from(`<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rg" x1="18%" y1="8%" x2="88%" y2="92%">
      <stop offset="0%" stop-color="#7dffc8"/>
      <stop offset="42%" stop-color="#3dffa8"/>
      <stop offset="100%" stop-color="#128a58"/>
    </linearGradient>
    <linearGradient id="rg2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#9dffda"/>
      <stop offset="100%" stop-color="#1fa868"/>
    </linearGradient>
  </defs>
  <g fill="url(#rg)">
    <path d="M118 96 L248 96 L318 168 L318 228 L268 228 L268 196 L168 196 L168 416 L118 416 Z"/>
    <path d="M268 228 L318 228 L398 416 L342 416 L278 284 L268 284 Z"/>
    <path fill="url(#rg2)" opacity="0.85" d="M118 96 L168 96 L168 196 L118 196 Z"/>
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
  // Right portion of the lockup mark (R loop + leg, without left f-bar)
  const left = Math.round(w * 0.14);
  const top = Math.round(h * 0.1);
  const cropW = Math.round(w * 0.22);
  const cropH = Math.round(h * 0.8);
  return sharp(LOGO)
    .extract({ left, top, width: cropW, height: cropH })
    .trim({ threshold: 12 })
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  let markBuf;
  try {
    markBuf = await fromLogoCrop();
  } catch {
    markBuf = null;
  }

  const svgBuf = await sharp(MARK_SVG).png().toBuffer();

  for (const out of MARK_PATHS) {
    await sharp(svgBuf).png({ compressionLevel: 9 }).toFile(out);
    console.log(`Wrote ${out}`);
  }

  if (markBuf) {
    await sharp(svgBuf).png().toFile(join(ROOT, "scripts", "logo-mark-crop-compare.png"));
    await sharp(markBuf).png().toFile(join(ROOT, "scripts", "logo-mark-from-logo.png"));
  }
}

main();

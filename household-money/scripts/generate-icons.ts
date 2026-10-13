/** Generates PWA icons from an inline SVG. Run: npm run icons */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = (pad: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1d4ed8"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M96 268 256 132l160 136v132a20 20 0 0 1-20 20H116a20 20 0 0 1-20-20z" fill="#ffffff"/>
    <text x="256" y="388" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="700" fill="#1d4ed8">$</text>
  </g>
</svg>`;

async function main() {
  mkdirSync("public/icons", { recursive: true });
  await sharp(Buffer.from(svg(0)))
    .resize(192)
    .png()
    .toFile("public/icons/icon-192.png");
  await sharp(Buffer.from(svg(0)))
    .resize(512)
    .png()
    .toFile("public/icons/icon-512.png");
  await sharp(Buffer.from(svg(70)))
    .resize(512)
    .png()
    .toFile("public/icons/maskable-512.png");
  await sharp(Buffer.from(svg(24)))
    .resize(180)
    .png()
    .toFile("public/icons/apple-touch-icon.png");
  await sharp(Buffer.from(svg(0)))
    .resize(32)
    .png()
    .toFile("public/icons/favicon-32.png");
  console.info("Icons written to public/icons/");
}

main();

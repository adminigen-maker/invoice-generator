/**
 * Generate PWA icons from an inline SVG (no external assets, no fonts — pure
 * shapes so it rasterizes identically everywhere). Run: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BG = "#0f172a"; // slate-900 (app primary)
const PAPER = "#ffffff";
const INK = "#0f172a";
const MUTE = "#94a3b8";
const ACCENT = "#10b981"; // emerald

// Invoice "paper with lines + total" glyph, centered in a 512 box.
function glyph() {
  return `
    <rect x="150" y="112" width="212" height="288" rx="22" fill="${PAPER}"/>
    <rect x="184" y="164" width="150" height="20" rx="10" fill="${INK}"/>
    <rect x="184" y="212" width="120" height="14" rx="7" fill="${MUTE}"/>
    <rect x="184" y="246" width="120" height="14" rx="7" fill="${MUTE}"/>
    <rect x="184" y="280" width="150" height="14" rx="7" fill="${MUTE}"/>
    <rect x="184" y="330" width="86" height="26" rx="9" fill="${ACCENT}"/>`;
}

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${BG}"/>${glyph()}</svg>`;

const square = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>${glyph()}</svg>`;

const out = resolve("public");
mkdirSync(out, { recursive: true });

const jobs = [
  [rounded, 192, "icon-192.png"],
  [rounded, 512, "icon-512.png"],
  [square, 512, "icon-maskable-512.png"],
  [square, 180, "apple-touch-icon.png"],
  [rounded, 32, "favicon-32.png"],
];

for (const [svg, size, name] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(resolve(out, name));
  console.log("✔", name, `(${size}px)`);
}
console.log("Done.");

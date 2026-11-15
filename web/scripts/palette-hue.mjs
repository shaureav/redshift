// Palette hue check (plan, section 3 and 13): no colour token in web/src/index.css or web/tailwind.config.js is
// red-adjacent, meaning a hue within 20 degrees of 0 with HSL saturation above 0.35.
import fs from "node:fs";
// Run from web/: node scripts/palette-hue.mjs (or pass other files to check).
const args = process.argv.slice(2);
const [cssPath, twPath] = args.length ? args : ["src/index.css", "tailwind.config.js"];
const files = [cssPath, twPath].filter(Boolean);
const hsl = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return { h: hue, s, l };
};
let n = 0;
const bad = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      n++;
      const { h, s } = hsl(m[0]);
      const dist = Math.min(h, 360 - h);
      if (dist <= 20 && s > 0.35) bad.push(`${f}:${i + 1} ${m[0]} hue ${h.toFixed(1)} sat ${s.toFixed(2)}: ${line.trim().slice(0, 80)}`);
    }
  });
}
console.log(`palette hue check: ${n} hex colours in ${files.length} files, ${bad.length} red-adjacent (hue within 20 degrees of 0, saturation above 0.35)`);
for (const b of bad) console.log("  " + b);
process.exit(bad.length ? 1 : 0);

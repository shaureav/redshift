// The hosted API's copy of the Python package (D46). Vercel builds the site from web/, so the function at
// web/api/index.py cannot import ../redshift; it imports this copy in web/api/_vendor/redshift instead.
//
//   node scripts/vendor-api.mjs           refresh the copy from ../redshift
//   node scripts/vendor-api.mjs --check   fail if the copy differs from ../redshift (run by npm test)
//
// Files are copied byte for byte, without __pycache__ or compiled files. The data are not copied: the function
// reads the site's published snapshot (web/public/data), so the live answers and the pages read the same files.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(web, "..", "redshift");
const DEST = join(web, "api", "_vendor", "redshift");
const skip = (p) => p.includes("__pycache__") || p.endsWith(".pyc");

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (skip(p)) return [];
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

if (process.argv.includes("--check")) {
  const want = files(SRC).map((p) => relative(SRC, p)).sort();
  const have = files(DEST).map((p) => relative(DEST, p)).sort();
  const stale = [
    ...want.filter((f) => !have.includes(f) || !readFileSync(join(SRC, f)).equals(readFileSync(join(DEST, f)))),
    ...have.filter((f) => !want.includes(f)),
  ];
  if (stale.length) {
    console.error(`The API's copy of the Python package is out of date (${stale.length} file(s), e.g. ${stale.slice(0, 3).join(", ")}). Run: node scripts/vendor-api.mjs`);
    process.exit(1);
  }
  console.log(`API package copy matches redshift/ (${want.length} files)`);
} else {
  rmSync(DEST, { recursive: true, force: true });
  cpSync(SRC, DEST, { recursive: true, filter: (p) => !skip(p) });
  console.log(`copied ${files(DEST).length} files to ${relative(web, DEST)}`);
}

// Test fixture: the exact data snapshot the site serves (web/public/data), loaded as text by Vite so tests
// need no Node APIs. Used by the parity and snapshot tests only.
const files = import.meta.glob("../../public/data/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export function loadSnapshot<T>(name: string): T {
  const key = `../../public/data/${name}`;
  if (!(key in files)) throw new Error(`snapshot file ${name} not found; run python -m redshift.build`);
  return JSON.parse(files[key]) as T;
}

// Refuse to build the site if the data snapshot is missing or the Python build did not pass.
import { existsSync, readFileSync } from "node:fs";
const dir = new URL("../public/data/", import.meta.url);
const required = ["dataset_version.json", "tests.json", "candidates.json", "candidate_evidence.json", "quality_report.json", "provenance.json", "investigations.json", "access_gap.json"];
for (const f of required) {
  if (!existsSync(new URL(f, dir))) {
    console.error(`Missing data/${f}. Run: uv run python -m redshift.build`);
    process.exit(1);
  }
}
const q = JSON.parse(readFileSync(new URL("quality_report.json", dir), "utf8"));
if (q.provenance_coverage.percent !== 100) {
  console.error(`Provenance coverage is ${q.provenance_coverage.percent}%, not 100%. Refusing to build.`);
  process.exit(1);
}
const bad = q.goldens.results.filter((g) => g.status === "unexplained_difference");
if (bad.length) {
  console.error(`Unexplained golden differences: ${bad.map((g) => g.id).join(", ")}`);
  process.exit(1);
}
console.log(`data snapshot OK (${JSON.parse(readFileSync(new URL("dataset_version.json", dir), "utf8")).version})`);

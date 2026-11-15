# Team tasks before submission

The exact steps the team must do, in order. Steps 1 and 2 can only be done by a person: the software is built so that nothing from a paper, and no AI-written text, is marked as checked until one of you has checked it.

## Before you start

Open Terminal and go to the project folder (the folder that contains `README.md`), then make `uv` available:

```bash
cd "<path to the project folder>"
export PATH=~/.local/bin:$PATH
```

Run every command below from that folder.

---

## Step 1. Verify the paper findings

At this build, 63 paper findings are drafted and 0 are verified (`data/processed/quality_report.json`). Until you verify them, the Saffire tests, the prebreathe points and the detection findings do not appear in the app, and the access gap chart shows 0 paper-described burns.

**The quickest way: the app's Verify page.** Open `/verify` on the running site (for example `http://localhost:4173/verify`). Enter your name, then for each finding read the quote, which is marked on the extracted page text, and press **Accept** or **Something is wrong** (with a note). The Saffire findings come first. When you are done, press **Download verifications.json**, save the file as `data/findings/verifications.json` (it already contains any earlier answers), rebuild (`uv run python -m redshift.build`) and commit the file. Decisions stay in your browser until you download them.

Or, in a terminal, run:

```bash
uv run python scripts/verify_findings.py
```

It asks for your name first. **The name you type is published in the app** next to every finding you verify, so use the form of your name the team has agreed to show.

For each finding it shows the source PDF, the page, the exact quote and the numbers taken from it. Open the PDF (in `data/papers/`) at that page. The page number is the PDF's own page count (page 1 is the first page of the file), which can differ from the number printed on the page. Then answer:

- `y` only if the quote is on that page, word for word, **and** the finding sentence says what the quote says, **and** every number listed matches the quote;
- `n` if anything is wrong (you will be asked what is wrong);
- `s` to skip for now (it will be shown again next time);
- `q` to quit.

Each answer is saved straight away to `data/findings/verifications.json`. Nothing is ever deleted from that file; a later answer for the same finding replaces the earlier one in the build.

### Priority findings

The script shows findings in alphabetical order of id, so press `s` to skip past the others and verify these first.

| Finding | What it unlocks | PDF | Page |
| --- | --- | --- | --- |
| `FND-S5-COND-P-O2` | Saffire V tests (V-2, V-3, V-4) on the map and in the access gap | `data/papers/NTRS-20210011521.pdf` | 3 (Table 1) |
| `FND-S6-COND-P-O2` | Saffire VI tests (VI-2, VI-3, VI-4) on the map and in the access gap | `data/papers/NTRS-20240002981.pdf` | 3 (Table 1) |
| `FND-S6-COND-MAT-FLOW` | Saffire VI materials, lengths and air flow | `data/papers/NTRS-20240002981.pdf` | 3 (Table 1) |
| `FND-EA-PB-14.7` | Prebreathe point at 14.7 psi / 21% | `data/papers/NTRS-20220011152.pdf` | 6 |
| `FND-EA-PB-10.2` | Prebreathe point at 10.2 psi / 26.5% | `data/papers/NTRS-20220011152.pdf` | 6 |
| `FND-EA-PB-8.2` | Prebreathe point at 8.2 psi / 34% | `data/papers/NTRS-20220011152.pdf` | 6 |
| `FND-S6-DET-SMOKE-981` | Saffire VI smoke detector reached its threshold at 981 s | `data/papers/NTRS-20240002981.pdf` | 5 |
| `FND-S6-DET-CO2-LIMIT` | Saffire VI PMMA tests and the NASA-STD-3001 CO2 limit | `data/papers/NTRS-20240002981.pdf` | 5 |
| `FND-S6-DET-CO-SMAC` | Carbon monoxide SMAC values cited by the Saffire VI paper | `data/papers/NTRS-20240002981.pdf` | 5 |

Also worth doing if time allows: `FND-S4-COND-P-O2` (places Saffire IV on the map; `NTRS-20210011521.pdf`, page 3) and `FND-EA-CAND-RECOMMENDED` (NASA's stated recommendation of 8.2 psi / 34% O2; `NTRS-20220009536.pdf`, page 1).

Tips for table quotes: the Saffire quotes are copied from a table, so the words run across a row (for example "Ambient Pressure (kPa) 100.0 70.7 54.1 54.6 55.2"). Check that the numbers belong to the columns the finding names; the finding sentence says which columns they are.

Findings with no page (from `data/papers/NTRS-20240003211.abstract.txt`) come from an NTRS record that has no PDF. Check those against that text file and the NTRS page https://ntrs.nasa.gov/citations/20240003211.

The PDFs are not committed to the repository (`.gitignore`), so do this on the computer that has them.

---

## Step 2. Rebuild, then check the AI-assisted text

Some summaries change once findings are verified, so check the AI text **after** step 1.

```bash
uv run python -m redshift.build
uv run python scripts/check_ai_text.py
```

It shows each of the 5 summaries and 6 cached answers (`data/processed/ai_text.json`) exactly as the app will show them, with each number from the data in [brackets]. Answer `y` only if every number matches its source, the text is plain and fair, and nothing is overstated. Answer `n` and say what is wrong otherwise. Answers are saved to `data/ai/checks.json`. If you answer `n`, tell Claude what is wrong so the template can be fixed; do not edit the text yourself.

---

## Step 3. Rebuild and run the tests

```bash
uv run python -m redshift.build
uv run pytest
cd web && npm install && npm run build && cd ..
```

The build must print "provenance coverage 100.0%" and must not say "BUILD FAILED".

After you verify findings, the candidate snapshot tests (`tests/snapshots/candidate_*.json`) are expected to fail, because the published-paper counts near the candidates change. This is the snapshot doing its job. Ask Claude to review the change and accept it (the procedure is in the docstring of `tests/test_build.py`: delete the snapshot files, rerun the tests to rewrite them, and review the new files).

Every rebuild after a verification changes the dataset version. The cite text in `README.md` must then be updated from `data/processed/dataset_version.json` (ask Claude to do it).

---

## Step 4. Decide about the ACME Flame Design file

ACME Flame Design (PSI-10) shows no licence on its PSI page (flags with code `no_licence` in `quality_report.json`). Decide, before the repository goes public, whether to keep its raw file in the repository or to fetch it at build time instead (`docs/OPEN_QUESTIONS.md`, Q15). Record the decision in `docs/DECISIONS.md`.

---

## Step 5. Create the GitHub repository

A team member must sign in to GitHub themselves. Never paste a password or token into a chat with Claude.

1. On github.com, create a new **public**, empty repository (no README, no licence, no .gitignore, since the project already has them).
2. Commit the current state (this Mac has no `git` program, so the project uses a pure-Python tool):

   ```bash
   uv run python scripts/commit.py "Final build for submission"
   ```

3. Push. The simplest route without the `git` program is GitHub Desktop: choose "Add an existing repository", select the project folder, then "Publish repository" or "Push origin". Alternatively install Apple's command line tools (`xcode-select --install`), which include `git`, and run:

   ```bash
   git remote add origin https://github.com/<owner>/<repository>.git
   git push -u origin master
   ```

   The local branch is called `master`.

4. Check on github.com that `web/public/data/` is in the repository. The website is built from that committed snapshot.

---

## Step 6. Create the Vercel project

A team member signs in to Vercel themselves.

1. "Add New Project", then import the GitHub repository.
2. Settings:
   - **Root Directory:** `web`
   - **Framework preset:** Vite (or Other)
   - **Install Command:** `npm install`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Deploy. Vercel needs no Python: the data snapshot in `web/public/data/` is committed, and `npm run build` checks it before building (`web/scripts/check-data.mjs`). `web/vercel.json` already routes every page to the app.
4. Open the deployed link in a private window, on a laptop and on a phone, signed out. Check that it loads with no login and that the dataset version in the footer matches `data/processed/dataset_version.json`.

Every time you rebuild the data (for example after more verifications), commit and push again; Vercel redeploys automatically.

---

## Step 7. Confirm the deadline

Ask the Local Lead for the exact submission deadline in writing. `docs/OPEN_QUESTIONS.md` (Q4) records two different times from different sources, and neither is confirmed. Plan to submit well before the earlier one.

---

## Step 8. Record the video

Follow the script in `docs/SUBMISSION.md`, part (a). Screen capture only: no faces. Burn in English subtitles. Keep it to 30 seconds or less. Before exporting, check every number on screen against the subtitles.

---

## Step 9. Fill in the submission form

- Project description: rewrite `docs/SUBMISSION.md` part (c) in your own words.
- Use of Artificial Intelligence: rewrite part (d) in your own words, accurately.
- References: copy from `docs/REFERENCES.md`, adding the exact challenge page URL.
- Links: the public Vercel link, the GitHub repository and the video.
- Run through the eligibility checklist in part (f).
- Practise the three hard questions in part (e), and make sure each of you can explain every module in `docs/EXPLAINER.md` in your own words.

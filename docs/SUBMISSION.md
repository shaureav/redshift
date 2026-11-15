# Submission drafts

**These are drafts for the team to rewrite in your own words.** Judges read the project page closely, and the rules require the work and the idea to be yours. Every number below is copied from the build of dataset version `2026-11-14+6121a570500e`; the file it comes from is named. Before you submit, re-read each number from the live app, because counts change when paper findings are verified.

Verify the Saffire V and VI condition findings before recording (`docs/TEAM_TASKS.md`, step 1, or the app's Verify page at `/verify`): the closing question rests on them.

---

## (a) 30-second demo video script

Screen capture only. No faces, no voices required. English subtitles: load `docs/redesign/video-subtitles.srt` as the caption track (or burn it in). Each card is at most two short lines and is timed to the clicks below, which follow the story intro of the redesigned plane (`docs/redesign/DEMO.md` has the full presenter path and recoveries).

| Time | Click | On screen | Subtitle |
| --- | --- | --- | --- |
| 0 to 6 s | Open the public link in a fresh private window (the intro plays once per browser). | Beat 1: a bare plot with the candidate atmospheres as pins. | NASA has not chosen the air / for its Moon base. Each pin is an atmosphere on the table: / oxygen across, cabin pressure up. |
| 6 to 12 s | Right arrow. | Beat 2: the land rises with the hatched sea; the tests fade in by fuel class. | These are the microgravity fire tests / NASA's own tables let us place. Land: tests sit near. / Hatched sea: unknown, not safe. |
| 12 to 18 s | Right arrow. | Beat 3: the land sinks to the solid land left by NASA's papers alone (outlined marks); the card's counts, and "The solid land left comes only from NASA's papers: 8 burns near a candidate, 0 downloadable as rows" (`access_gap.json`). | Now only solid materials. 263 solid-fuel burn rows. / None records pressure. |
| 18 to 23 s | Click **Explore**. | The plane at 8.2 psi / 34% O2, Solids only on; the panel: "40 tests sit near this point. Solid material: 0 from PSI tables, 3 from verified papers." (`candidate_evidence.json`). | At 8.2 psi and 34% oxygen, 40 tests nearby. / Solid burns: 0 in NASA's tables, 3 only in papers. |
| 23 to 28 s | In the panel's What's missing, click **Ask NASA for the data** (the data request page), or scroll to Ask the evidence and click the question chip. | The data request: the gap's counts, the seven solid-fuel tables by DOI, the Saffire papers, three asks. | If NASA has already burned fabric in near-Moon-base air, / why can't a researcher download it? |
| 28 to 30 s | Hold. | The page title and the link. | Redshift: The Atmosphere Trade Studio / [your public link] |

Recording notes:
- Record at 1920 x 1080 (or 1440 x 900), browser zoom 100%, dark theme, signed out, no extensions visible.
- Keep it to 30 seconds or less. Put your public link in the last subtitle card before exporting.
- Check every number on screen matches the subtitles before exporting. The 263, 129 and 0 come from PSI's tables; the 40 and the 3 include the paper burns Swastik Katiyar verified on 15 November (D44). Re-read every number from the live app before exporting.

---

## (b) Seven-slide backup outline

1. **The decision.** NASA has not chosen the Moon-base cabin atmosphere. Candidates from the ACME BRE PSI page: 14.7 psi / 21%, 10.2 psi / 26.5%, 8.2 psi / 34% O2. The trade-off: prebreathe, hypoxia, flammability.
2. **The tool.** One map: oxygen against pressure. Every PSI fire test that records both, split by fuel class (gas, droplet, solid, emulator) and source type. A plane, not a score.
3. **Click 8.2 psi / 34%.** 37 PSI-table tests nearby: 17 droplet (FLEX), 20 gas (ACME CFI-G), 0 solid (`candidate_evidence.json`). Flame temperature of stoichiometric methane there: 2570.4 K, which explains rather than predicts.
4. **The access gap.** 263 solid burn rows in PSI tables; 129 record oxygen; 0 record pressure; 0 placeable near a candidate (`access_gap.json`). Saffire V and VI burned solids near these atmospheres, but the results are in conference papers (NTRS 20210011521, NTRS 20240002981), not rows.
5. **Trust.** Raw files hash-checked; every number clickable to its file, line and raw text; 678 flags published, nothing silently fixed; 11698 numbers checked, 100.0% with provenance (`quality_report.json`); paper findings human-verified with quote and page.
6. **What to test next.** The planner ranks 126 combinations of oxygen, pressure and material by how much a new test would add. It ranks experiments, not atmospheres.
7. **The ask.** Publish the Saffire IV to VI conditions and ACME BRE chamber pressures as PSI rows. Open data, open code, citable dataset. The question and the link.

---

## (c) Project description, mapped to the judging criteria

Target awards: **Best Use of Data**, **Best Use of Science**, **Best Mission Concept**.

### Summary (about 100 words)

NASA has not yet chosen the cabin atmosphere for the Moon base. Lower pressure with more oxygen shortens the prebreathe before a spacewalk, but changes how materials burn. Redshift puts every microgravity fire test from NASA's Physical Sciences Informatics (PSI) tables onto one map of oxygen against pressure, pins the candidate atmospheres, and shows what evidence exists near each one and what is missing. Its central finding is an access gap: PSI's tables hold 263 solid-fuel burn rows, but none records pressure, so none can be placed near a Moon-base candidate. NASA has burned solids near these atmospheres, in Saffire V and VI, but those results are in papers, not downloadable data.

### Influence

The Moon-base atmosphere is a live NASA decision that affects every future lunar crew, and fire is the least developed part of the evidence behind it. Redshift shows the people making that trade study exactly which fire evidence they can use and which they cannot. The access gap is actionable for NASA itself: publishing a handful of conditions from existing papers as table rows would change what researchers can download. The cleaned dataset, the code and the API are open, so researchers and students can reuse them after the event.

### Creativity

Instead of a chatbot over an archive, Redshift reframes the archive as a trade study on a decision plane. It puts prebreathe, flame temperature and evidence density on one map, and it measures something nobody else measures: the gap between "tested" and "downloadable".

### Validity

- A reproducible pipeline from raw PSI files: one command rebuilds every output, and two builds are byte-identical.
- Every number on screen carries its source: file, line, column and raw text, or paper, page and exact quote. A lint fails the build if any number lacks one (11698 checked, 100.0%, `quality_report.json`).
- No data is fixed or invented. 678 data problems are flagged publicly with file and line; anomalous values are set to null, never corrected.
- Earlier counts are reproduced or explained: 24 of 26 golden checks match, and the 2 differences are explained (for example, 129 BASS-II burns that an earlier count placed at 1 atm, though the table records no pressure).
- Honest limits are shown in the app: flame temperature explains and does not predict; the nearness rule is judgement, with a sensitivity table; unknown is hatched and labelled "no tests recorded".
- Paper findings are drafted with exact quotes, checked by code against the page text, and shown only after a named team member verifies them.

### Relevance

Redshift uses the challenge's own data (PSI), and it summarises, ranks and interprets the investigations as the challenge asks: cards and a compare view for every PSI combustion investigation, dossiers per atmosphere and material, and a test planner. Its SI jobs are grounded: reading papers into quoted findings, writing summaries whose numbers come only from the data, and cached answers that cite their sources and say what the data does not cover. It is a working, deployed web app with an API.

### Presentation

One story: the decision, the map, click 8.2 psi / 34%, no solid tests recorded nearby, the access gap, the question. Every number in the story is one click from its source.

### Award fit

- **Best Use of Data:** the finding is about data access itself, and the product makes PSI's combustion data usable on one map with full provenance.
- **Best Use of Science:** reproducible pipeline, golden checks, sensitivity analysis, no prediction claims, human-verified quotes.
- **Best Mission Concept:** tied to a real Artemis-era design decision, with a planner that points to the tests that would add most evidence.

---

## (d) "Use of Artificial Intelligence" field

> We used Claude, an AI assistant made by Anthropic, in two ways. During planning, we used it in a chat for background research and to review our draft concept; that review pointed out that our first headline was wrong (NASA's Saffire VI did burn solids near a candidate atmosphere) and we reworded our finding as an access gap. During the build, Claude acted as our coding assistant: it wrote all of the code, the data pipeline, the tests and the draft documentation, under our direction. The idea, the choices and the final wording are ours.
>
> AI was never allowed to write a data value. Every number comes from a NASA file, a checked quote or a documented calculation, and every number on screen links to its source. Paper findings were drafted by AI with exact quotes and page numbers; code checks that each quote is on that page, and each finding appears only after a named team member has checked it against the PDF. The short summaries and answers in the app are AI-assisted templates that contain no numbers of their own: every number is filled in from the data with its source, a checker rejects any stray number or unknown citation, and each text shows whether a team member has checked it. The "Ask the evidence" box also answers new questions live with Claude: it may use only the dataset, it writes numbers as references that the app fills in from the data with their sources, and code rejects any answer with a stray number, an unknown citation, a recommendation or no statement of what the data does not cover; live answers are labelled as checked by code, not by a person.

Rewrite this in your own words, and make sure it describes what you actually did, including any other AI tools you used.

---

## (e) Three hard questions, with prepared answers

### 1. "Is the gap only in PSI? Maybe the data exists elsewhere."

Yes, our measured gap is about PSI, and we say so. PSI is the system the challenge points to and the public place where NASA releases microgravity combustion data as tables. Within PSI we can prove it: 263 solid-fuel burn rows, 129 with oxygen, 0 with pressure (`access_gap.json`). Outside PSI, we found the Saffire V and VI conditions in two NTRS conference papers, as numbers inside PDF tables, not as downloadable rows. We have not surveyed every NASA database or journal, and the ACME BRE journal paper is not openly available on NTRS. Our point is about access: the data a researcher can download and map, not whether NASA has the knowledge internally.

### 2. "Why don't you predict flammability for each atmosphere?"

Because the data cannot support it, and a confident number would be invented. Near the low-pressure candidates there are no solid-material tests with pressure recorded in PSI, there is no partial-gravity data, and outcome labels are recorded verbatim without shared definitions (FLEX's "Disruption" is not defined on its PSI page). Flame temperature rises with oxygen, but it explains rather than predicts whether a real material burns. A prediction would hide exactly the gap we found. Instead we show the evidence that exists, mark unknowns as unknown, and the planner points to the tests that would fill the gap.

### 3. "Did the AI come up with the idea?"

Answer honestly, in your own words, and describe what actually happened. A truthful outline, based on the documents in `docs/`: the Atmosphere Trade Studio concept, tying the data to NASA's undecided Moon-base atmosphere, is in the team's draft (`docs/sources/Redshift_The_Atmosphere_Trade_Studio_draft.pdf`). An AI chat assistant helped with background research and reviewed that draft, and the review is what pointed out that Saffire VI had burned solids near a candidate atmosphere, which led you to reframe the headline as an access gap. Claude then wrote the code under your direction. You decided what to build, what to cut, and what every screen says. Be ready to explain any part of the app yourself (`docs/EXPLAINER.md`).

---

## (f) Eligibility checklist

- [ ] Submitted to the official challenge: Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data.
- [ ] Every submission field is in English.
- [ ] Every external resource is listed in the References field (copy from `docs/REFERENCES.md`).
- [ ] Original work confirmed; AI use disclosed in the "Use of Artificial Intelligence" field.
- [ ] Video is 30 seconds or less, screen capture only, with English subtitles.
- [ ] Public project link opens with no login, on a phone and a laptop, in a private window.
- [ ] Repository is public (decide first about the ACME Flame Design file with no licence, `docs/OPEN_QUESTIONS.md` Q15).
- [ ] Deadline confirmed in writing with the Local Lead (`docs/OPEN_QUESTIONS.md` Q4). Submit well before it.

---

## (g) Roadmap slide: where Redshift goes next

Draft for a final or backup slide. These are plans, not features: say "next", never "we have".

- **Bring your own data.** A lab drops its own test results onto the plane as a separate, clearly marked layer. It never mixes into the counts built from NASA's tables.
- **Release watcher.** When NASA publishes new PSI data, the pipeline rebuilds and writes a "what changed in the evidence" note for each candidate atmosphere, so the map stays current without anyone re-checking it by hand.
- **Beyond the Moon.** The same plane for Mars transit vehicles, Gateway and commercial stations: only the candidate pins change.
- **An open API and a ten-line notebook.** Any researcher can pull the evidence near a point, with its provenance, and cite it by dataset version.
- **The materials checklist.** A habitat engineer lists the cabin's materials and sees which have any test evidence near the chosen atmosphere, and which are unknown.
- **The gap over time.** The plane filling in year by year as investigations flew, showing how long the solid-material gap has stood.


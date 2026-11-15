# AI pre-check of the 63 paper findings (15 November 2026)

**This is not verification.** An AI (Claude) read every draft finding against its quote and the extracted text around it on the page, to help a team member verify faster. The project's rule stands: a finding reaches the plane only when a named team member checks the quote and page in the paper and accepts it on the Verify page (`/verify`) or with `scripts/verify_findings.py`. Use this list to decide where to look hardest, not as a reason to accept without reading.

Code had already checked that every quote is on its stated page and every number appears in its quote (all 63 pass those checks). The pre-check asked the question code cannot: does the finding sentence say only what the quote, and the page around it, says?

## Summary

| Result | Count | What to do |
| --- | --- | --- |
| Consistent with the quote and its page | 53 | Read the quote on the page as marked; accept if you agree |
| Consistent, with a note to look at | 4 | Read the note, then decide |
| Quote only in the NTRS abstract (no page text here) | 4 | Open the NTRS record and find the quote |
| **Says more than the source** | **2** | **Reject with the note given, unless the paper says otherwise** |

## Reject unless the paper says otherwise

1. **FND-S6-RES-SCALE** (Saffire VI paper, page 2). The finding says "The Saffire IV to VI tests spanned 1.5 to 3.2 kW". The page's sentence is "These tests spanned 1.5 to 3.2 kW", continuing page 1's "a series of large-scale experiments", which reads as the Saffire series as a whole, not IV to VI. Suggested note: "The paper says 'these tests' (the Saffire series of large-scale experiments), not Saffire IV to VI."
2. **FND-S45-RES-HRR** (Saffire IV and V paper, page 2). The finding says average vehicle conditions "stayed within acceptable levels, as the authors put it". The authors wrote that conditions "did not rise to unacceptable levels". Close in meaning, but the finding attributes words the authors did not use, and it edges towards a safety reading. Suggested note: "Use the authors' words: did not rise to unacceptable levels."

## Consistent, with a note

- **FND-S6-RES-T2-PMMA** (Saffire VI, page 6, Table 2). The PMMA rows have two blank cells (the fuel-consumption calorimetry columns), so their numbers shift left in the extracted text. The column reading is consistent with the header and with the SIBAL row (and Figure 5 says VI-3's heat release came from oxygen consumption), but check the row against the table in the PDF.
- **FND-S5-RES-V2-REIGNITE** (Saffire IV and V, page 4). The source itself says the sample burned "for the initial 300 seconds while the fan was on" and that the fan was turned off "at approximately 280 seconds". The finding copies both faithfully; accept if the PDF reads the same.
- **FND-EA-PB-10.2** and **FND-EA-PB-14.7** (Exploration atmospheres, page 6). Each finding ends with a note that one bound "is not encoded as a value". True, but it will show in the app as part of the finding; accept, or reject asking for that clause to be dropped.

## Quote only in the NTRS abstract

These four come from `NTRS-20240003211.abstract.txt` (the abstract of the Moon to Mars exploration atmosphere presentation; there is no PDF page). Open https://ntrs.nasa.gov/citations/20240003211 and find each quote in the abstract.

- FND-EA-CAND-REVISED, FND-EA-CAND-SEALEVEL, FND-EA-PB-SEALEVEL, FND-EA-PB-SHUTTLE-10.2. All four quotes appear word for word in the abstract text held in the repository. FND-EA-PB-SHUTTLE-10.2 drops "retroactively" from "retroactively certified"; the meaning is kept.

## Consistent with the quote and its page (53)

Details the finding adds beyond its quote were checked against the page and hold: the Saffire VI flow change is in Figure 5's caption for VI-3 (two-sided PMMA); the 981 s smoke threshold is the far-field detector (FFD) for VI-3 (Figure 7); Table 1's columns run IV-1, V-2, VI-2, VI-3, VI-4 (Saffire VI paper) and IV-1, IV-2, V-2, V-3, V-4 (Saffire IV and V paper); the flame-size table's columns run I-1, II-5, II-6, III-1, IV-1, V-2; the Saffire V reduced-flow hold is followed by the fan being turned off; Saffire IV-2 is the two-sided PMMA sample; the prebreathe slide's heading is "Saturation Atmosphere"; FLEX Table IX's columns put 1.69 mm as the initial diameter and 4.3 s as the burn time.

- Saffire VI: FND-S6-COND-FLOWCHANGE, FND-S6-COND-MAT-FLOW, FND-S6-COND-P-O2, FND-S6-COND-SIBAL, FND-S6-COND-SIZES, FND-S6-DET-CO-EXCEED, FND-S6-DET-CO-SMAC, FND-S6-DET-CO2-LIMIT, FND-S6-DET-CONCL, FND-S6-DET-SMOKE-981, FND-S6-DET-SMOKE-CONCL, FND-S6-RES-T2-SIBAL, FND-S6-RES-TEMP-VS-GAS
- Saffire V: FND-S5-COND-MAT-FLOW, FND-S5-COND-P-O2, FND-S5-COND-REDUCEDFLOW, FND-S5-RES-EXTINCT, FND-S5-RES-V3-LENGTH
- Saffire IV and V: FND-S45-COND-MATERIALS, FND-S45-COND-SIZES, FND-S45-RES-FLAMESIZE
- Saffire IV: FND-S4-COND-MAT-FLOW, FND-S4-COND-P-O2, FND-S4-RES-IV2-NOFLOW
- Exploration atmospheres: FND-EA-CAND-HABITAT, FND-EA-CAND-NITROX, FND-EA-CAND-RECOMMENDED, FND-EA-CAND-STUDY, FND-EA-CAND-TABLE, FND-EA-COND-O2, FND-EA-COND-PRESSURE, FND-EA-PB-8.2, FND-EA-PB-ACTUAL, FND-EA-PB-CAVEAT, FND-EA-PB-PROTOCOL, FND-EA-RES-DCS
- ACME BRE: FND-BRE-COND-DROP-P, FND-BRE-COND-DROP-SETUP, FND-BRE-COND-FUELS, FND-BRE-COND-ISS-ATMOS, FND-BRE-COND-VOLUME, FND-BRE-RES-FUEL, FND-BRE-RES-O2-LIMIT, FND-BRE-RES-SIZE
- FLEX: FND-FLEX-COND-DIAMETERS, FND-FLEX-COND-METHANOL-RANGE, FND-FLEX-COND-PRESSURES, FND-FLEX-DEF-DISRUPTION, FND-FLEX-DEF-DISRUPTIVE-BURNING, FND-FLEX-RES-CONTAMINANT, FND-FLEX-RES-DISRUPTIVE, FND-FLEX-RES-LOI, FND-FLEX-RES-TESTEND

## The key 8: verify these first

The Verify page opens on them ("The key 8"). They are the findings the app itself waits on; the other 55 can stay "awaiting check", which the app says honestly.

| Finding | What it unlocks in the app | Pre-check |
| --- | --- | --- |
| FND-S6-COND-P-O2 | Saffire VI-2, VI-3 and VI-4 placed on the plane (pressure and oxygen); the AI summary that cites them | Consistent; Table 1 columns run IV-1, V-2, VI-2, VI-3, VI-4 |
| FND-S5-COND-P-O2 | Saffire V-2, V-3 and V-4 placed on the plane | Consistent; columns run IV-1, IV-2, V-2, V-3, V-4 |
| FND-S4-COND-P-O2 | Saffire IV-1 and IV-2 placed on the plane (100 kPa, 22%) | Consistent; same table |
| FND-S6-COND-MAT-FLOW | The Saffire VI samples' flow speed | Consistent; same Table 1 as FND-S6-COND-P-O2 |
| FND-EA-PB-8.2 | The prebreathe figure the panel shows at 8.2 psi / 34% (the demo point) | Consistent |
| FND-EA-PB-10.2 | The prebreathe figure at 10.2 psi / 26.5% | Consistent; note on its closing clause |
| FND-EA-PB-14.7 | The prebreathe figure at 14.7 psi / 21% | Consistent; note on its closing clause |
| FND-EA-CAND-RECOMMENDED | The source of the 8.2 psi / 34% candidate NASA recommended | Consistent |

After these, if there is time, the Saffire VI detection findings (FND-S6-DET-*), which judges remember.

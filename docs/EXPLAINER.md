# Explainer: how Redshift works, in plain English

One short entry per part of the software, written so any team member can explain it to a judge in their own words. Read them aloud and then say them your own way.

## The big picture

Redshift takes NASA's public microgravity fire data, cleans it without changing it, and puts every test on one map of oxygen against cabin pressure. On that map we pin the atmospheres NASA is considering for the Moon base. Then you can see, for each one, which fire tests sit nearby and which are missing.

## Ingest and manifest (`redshift/ingest/manifest.py`)

We downloaded NASA's files once and never edit them. The manifest stores a fingerprint (a SHA-256 hash) of every file, and every build checks those fingerprints again. If even one byte of a raw file changes, the build stops.

## Tables reader (`redshift/ingest/tables.py`)

This reads each NASA spreadsheet exactly as it is, keeping the original text of every cell and the line number it came from. That line number is how we can later point to the exact place in the file where any number came from.

## Adapters (`redshift/normalise/`)

Every NASA experiment table has different column names, so each experiment gets its own small translator, called an adapter. Each adapter is written by hand and explains in plain words which column means what, so a scientist can check it. We never let the computer guess what a column means.

## Transforms (`redshift/transforms.py`)

There is a short, fixed list of changes we are allowed to make to a raw value, such as removing spaces or converting mmHg to kPa with an exact constant. Every change made to a value is written down next to it. Anything not on the list is not allowed.

## Flags (`redshift/flags.py`)

When a value looks wrong, for example an oxygen level of "3400%", we do not fix it, because we would only be guessing. We keep the original text, set the value to "not recorded", and write a flag saying what looks wrong and where. All flags are listed publicly on the Data Quality page.

## Provenance (`redshift/provenance.py`)

Every number carries a label saying where it came from: which file, which line, which column and what the original text was, or which paper, which page and the exact quote. Numbers we calculate carry the method and the inputs instead. This is how anyone can check any number.

## Build (`redshift/build.py`)

One command, `uv run python -m redshift.build`, rebuilds everything from the raw files. It checks the fingerprints, runs every adapter, does the science, runs all the checks and writes the output files. If any check fails, it refuses to publish anything.

## Golden checks (`redshift/goldens.py`, `redshift/goldens.json`)

Before we built the software, earlier analyses gave us some expected numbers. The build recalculates each one and compares. If a number does not match, we do not adjust the code to make it match: we find out why and write the explanation down, and if there is no explanation the build fails.

## Nearness (`redshift/science/nearness.py`)

To decide whether a test is "near" a candidate atmosphere, we measure the distance between them in steps: 5 percentage points of oxygen, or a 25% change in pressure, counts as one step. A test is near if it is within 1.5 steps. If a test did not record its pressure, we say "unknown", never "not near", because we cannot know.

## Flame temperature (`redshift/science/flame_temperature.py`)

We use a chemistry program called Cantera to calculate how hot a methane flame can get in each atmosphere. More oxygen means a hotter flame. This explains why the atmosphere matters, but it does not predict whether a real material will catch fire, so we never use it as a score.

## Candidate atmospheres (`redshift/science/candidates.py`)

The atmospheres on the map come from exact sentences in NASA sources: three from the ACME BRE experiment page and two from the official challenge statement. The build checks that each sentence really is in the file. We never rank them or say which one is better.

## Test planner (`redshift/science/planner.py`)

The planner looks at a grid of 126 combinations of oxygen, pressure and material type and asks: where would a new fire test add the most evidence? A combination scores higher if it is close to a candidate Moon-base atmosphere and has few tests already. It ranks experiments to do, never atmospheres to choose.

## Prebreathe (`redshift/science/prebreathe.py`)

Before a spacewalk, astronauts breathe pure oxygen for a while to avoid the bends; this is the prebreathe. We show only the prebreathe times NASA has published, with the quote and page, and we never fill in values between them. NASA itself calls these figures unvalidated estimates, and we say so.

## Paper findings (`redshift/papers/findings.py`, `scripts/verify_findings.py`)

Some of the most important tests, like Saffire V and VI, are only in NASA papers. An AI drafted findings from those papers with exact quotes and page numbers, and the computer checks that each quote really is on that page. Then one of us opens the PDF, reads the quote and confirms it, and only after that does the finding appear in the app with our name.

## AI text (`redshift/ai/text.py`, `scripts/check_ai_text.py`)

The short summaries and answers in the app were drafted with AI, but they are not allowed to contain any numbers of their own. Every number is filled in from our checked data, with its source, and a checker throws out any text with a stray number, a banned word that judges an atmosphere, or a citation that does not exist. A team member then reads each one before we mark it as checked.

## API (`redshift/api/app.py`)

The API lets researchers get our data directly from their own code, with documentation at `/docs`. It only serves the files the build already made, so it can never show a number that differs from the website.

## Provenance lint (`redshift/export/lint.py`)

After the build, a checker walks through every output file and looks at every single number. If any number does not have a source label that exists, the build fails. In this build it checked 11698 numbers and all of them had a source.

## The probe grid (`redshift/science/probe.py`)

When you drag the probe across the plane, the numbers in the panel are not worked out by the website. The build has already worked out the nearness counts at every point of a fine grid (every half percentage point of oxygen, every 0.1 psi of pressure), so the probe simply looks up the nearest grid point and says which point it is showing. A test checks that this grid gives exactly the same counts as the candidate dossiers at every candidate atmosphere.

## The plane and the evidence panel (`web/src/pages/Home.tsx`, `web/src/charts/Plane.tsx`, `web/src/components/EvidencePanel.tsx`)

The home page is one big map of oxygen against cabin pressure with a panel beside it. Wherever you put the probe, the panel answers one question: what do we know about fire here, and what is missing? Empty rows are hatched because no tests means unknown, never safe, and the "Solids only" switch shows that no solid-material burn in NASA's tables can be placed anywhere on the map. The panel reads like an instrument: four tiles with the counts near the point, a "What's missing" list straight underneath, and two small profiles of the counts along each axis through the probe, every number a door to its source.

## The coastline of knowledge (`web/src/lib/coast.ts`, `web/src/charts/planeToolbar.tsx`)

The map is drawn like a coastline: land wherever the build counted at least one test near a point, hatched open sea wherever it counted none, and the coast as the line between. Turn on "Solids only" and the land sinks, because no solid-material test can be placed anywhere; the candidate pins then all read "at sea", and the map itself stays exactly where it was. Zoomed out past the area the build computed, a dashed line marks where that area ends and a caption says nothing was computed beyond it. The words on the pins (inland, on the coast, at sea) describe the recorded evidence around that point, never fire risk, and the plane's controls sit in one small toolbar in its corner.

## Labels that never overprint (`web/src/charts/Plane.tsx`, `placePins` and `captionY`)

Each pin's label tries its four sides and takes the first that covers nothing else; if none is clear, it drops the evidence word, then shortens to the oxygen value, and only then disappears, so two labels never print over each other. A label on every pin comes first: if one pin's evidence word would leave another pin with no label at all, the words are left off. Under "Solids only" the caption that says no solid test can be placed is placed first, clear of every pin, and the labels make room for it. The full names and words are always in the Candidates menu.

## The story intro (`web/src/components/Intro.tsx`)

On a first visit the plane tells its own story in three beats: the atmospheres NASA is weighing appear as pins on a bare map (no land or sea yet, so nothing is claimed about tests before they are shown), the fire tests NASA's tables let us place in the range shown rise as land with the hatched sea around them, and then, with only solid materials kept, the land sinks and the card cites the counts that explain why (each count opens its source). It never moves on by itself: click, scroll or press the arrow keys to move on, skip at any time, and press Explore to take over the plane at 8.2 psi and 34% oxygen with solids only on. It shows once per device and the command palette can replay it.

## Phones and tablets (`web/src/components/Sheet.tsx`, `web/src/lib/gesture.ts`)

On a phone or tablet the evidence panel becomes a sheet at the bottom of the screen. Resting low it shows the point and its four counts, pulled halfway it also lists what is missing, and pulled up it shows everything; drag its handle, tap it, or use the arrow keys. When the intro replays, the sheet drops back to its lowest resting point so the story plays over the map. On the plane a tap pins the probe, pressing and holding previews a point without pinning it, and two fingers pinch or slide to zoom and pan; the zoomed view is kept in the link. On a phone the plane's tools fold into one Tools button, and every control is big enough for a thumb.

## Feel: trail, keys, toasts and sound (`web/src/lib/shortcuts.ts`, `web/src/lib/geiger.ts`, `web/src/components/Toaster.tsx`)

As the probe moves it leaves a short fading trail, thick over land and thin over sea; crossing the coast makes the nearby stretch of coast flash (and a phone buzz), and snapping to a candidate sends a ring out from its pin. Keys 1 to 5 jump to the candidates, S shows solids only, G opens the access gap, C opens Compare and ? lists every key; none of them fire while you type. An optional Geiger mode, off until you switch it on, clicks faster where more tests sit near the probe and falls silent at sea, so the plane can be heard as well as seen.

## Ask the evidence (`web/src/components/AskBox.tsx`, `redshift/ai/ask.py`)

The question box first looks for an answer that our team has already checked. On a server with a model key it can also answer new questions, but the model is not allowed to type a single number: it can only point at numbers we hand it, and a program rejects the answer if it types one anyway, cites something we did not give it, or recommends an atmosphere.

## The error screen (`web/src/components/ErrorBoundary.tsx`)

If any page of the website hits an error while it is drawing, the reader sees a short error screen instead of a blank page: what failed, why Redshift stops rather than show a half-drawn page or a number it cannot trace, and a button to reload. The view is kept in the address bar, so a reload returns to the same place.

## The website's Value popover (`web/src/components/Value.tsx`)

On the website, every number is drawn by one shared piece of code, and every number is a button. Click it and a small box shows where it came from: the file and line, or the paper and page, the original text, and whether a person has verified it. If a value was never recorded, it says "not recorded" instead of showing a made-up number.

## Design tokens and the contrast check (`web/src/index.css`, `web/scripts/contrast.mjs`)

Every colour, text size, animation time and shadow on the website is set once, in one stylesheet, and every screen uses those settings instead of its own. Line heights follow the same six text roles, and a printed page takes the light colours on white paper. A small program reads that stylesheet and measures the contrast of every pairing that matters, in the dark theme, the light theme and on paper: text must be clearly readable (4.5 to 1), and every data marker and every control's edge must stand out from what is behind it (3 to 1). If a change ever breaks that, or brings red into the palette, the tests fail. A second small program (`web/scripts/palette-hue.mjs`) reads every colour in the stylesheet and the Tailwind settings and fails if any is close to red (within 20 degrees of red on the colour wheel and clearly saturated).

## Verify findings (`web/src/pages/Verify.tsx`, `redshift/papers/findings.py`, `verify_queue`)

An AI read NASA's papers and drafted each finding with an exact quote; code checked every quote is on its page. This page is where a person finishes the job: it shows each draft with the quote marked on its page, and a named team member accepts or rejects it. The decisions are downloaded as the same log the command-line script writes, and only the build turns an accepted finding into evidence.

## The data request (`web/src/pages/Request.tsx`)

The access gap written as an ask NASA could act on: publish the pressure for each solid-fuel test, publish the Saffire results as a table, and mark unknowns as unknown. Every count comes from the build and opens its source. It asks for data, never for an atmosphere.

## The trust strip and the coast at every step size (`web/src/pages/Home.tsx`, `web/src/charts/Plane.tsx`)

Under the plane, one line says what it is built from (21 tables, 1,942 tests, every published number traced, anomalies flagged and none altered), each count opening its source. A layer you can switch on draws the coast at the smallest and widest nearness steps: land inside the solid line is land whichever step you choose, land only inside the dashed line depends on the choice.

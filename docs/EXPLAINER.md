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

## The website's Value popover (`web/src/components/Value.tsx`)

On the website, every number is drawn by one shared piece of code, and every number is a button. Click it and a small box shows where it came from: the file and line, or the paper and page, the original text, and whether a person has verified it. If a value was never recorded, it says "not recorded" instead of showing a made-up number.

# Project Redshift: Full Conversation Export (A to Z)

Exported 14 Nov 2026. This is a standalone record of the whole "Win Flame in Freefall challenge" thread. It contains everything said, everything researched, the full guide, and where things stand now.

**Contents**

- A. The setup: team, challenge, clock
- B. The original request, word for word (the full challenge brief and resource links)
- C. What was done in this thread, step by step
- D. The recommendation in brief
- E. Hour-one checks and open questions
- F. Current status and next steps
- G. Extra research notes not in the guide
- H. The full guide (Part 1: winning framework; Part 2: science primer; sources)

---

## A. The setup

| Item | Detail |
| --- | --- |
| Team name | Project Redshift |
| Requester | Ayan |
| Competition | NASA Space Apps Challenge |
| Challenge | Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data |
| Clock | 48 hours, starting about 12:47 PM IST on Sat 14 Nov 2026 (when the resources were released) |
| Assumed deadline | About 12:47 PM IST on Mon 16 Nov 2026. **Not confirmed.** Check with your Local Lead |
| Recommended submit time | Hour 46, by 10:45 AM IST on Mon 16 Nov |
| First deliverable | Research plus a written guide. No code yet |
| Standing rule | Ask before writing any code |
| Preferred voice | A blunt "advisory council" voice (Buffett and Munger by default, Jobs on product, Musk on first principles, Bezos on customers, Dalio on systems), ending with the key question to ask |
| Guide doc (live, editable) | https://claude.ai/artifact/GwfddDi731ydyDEWHBnQXD |

---

## B. The original request, word for word

Ayan's message that started the thread (sent 14 Nov 2026, 07:17 UTC, which is 12:47 PM IST), copied as written:

> Role: you are an expert in this competition of NASA with over 10+ years of experience helping students succeed in nasa hackathons EVERYTIME. Next batch is us, competiting in the challenge below:
> Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data
> our team name for the same is project redshift, so u have to guide us entirley to succeed
> To start off, below are the details fo the challenge:
>
> For decades, NASA has studied how flames and fire behave in microgravity, gathering a trove of experimental data along the way. That knowledge matters more than ever as humans gear up to return to the Moon and press on to Mars, yet the volume of results makes them hard to find, compare, and understand. Your challenge is to create an interactive, super intelligence (SI) powered dashboard that summarizes, ranks, and interprets those findings to deliver fire safety insights for human space exploration.
>
> **Background**
>
> Fire hazards are extremely dangerous in space exploration! In describing a smoke alarm that went off during the recent Artemis II mission, the commander commented, "[If] you want to get somebody's attention really quick, make the fire alarm go off in your spacecraft when you're still about 80,000 miles from home." Decades earlier, the Apollo 13 crew endured the life-threatening results of an oxygen tank explosion on their way to the Moon. Similarly, a multinational crew survived a fire aboard the Mir space station caused by an oxygen generator failure. In 1967, the Apollo 1 crew died in a pre-launch test when fire erupted in their oxygen-filled spacecraft.
>
> Compared to Earth, flames in free fall (i.e., in microgravity) are often dramatically different because of the absence of buoyancy and thus rising hot gases. Instead of a flickering teardrop, a candle flame becomes a ghostly blue sphere reliant on diffusion for its oxygen.
>
> NASA's spacecraft fire safety work is focused on prevention, detection, and suppression. Prevention is achieved by controlling ignition sources and through material selection, which depends on understanding flammability limits. To facilitate spacesuit use, an atmosphere with increased oxygen and reduced pressure compared to Earth's is expected within the planned Moon Base and pressurized rovers. Flammability is highly dependent on oxygen concentration, and air flow is also important in microgravity. Flammability studies focus on solid materials such as fabrics and plastics, as studied in the Burning and Suppression of Solids (BASS and BASS-II) and Spacecraft Fire Safety Demonstration (Saffire-I, -II, and -III) investigations.
>
> Fire detection was tested in microgravity through the Smoke and Aerosol Measurement Experiment studies (SAME and SAME-R). Suppression was studied in the Flame Extinguishment Experiment (FLEX) through dilution of the chamber atmosphere with carbon dioxide and helium, both of which suppress fire.
>
> **Objectives**
>
> Results from low-gravity combustion experiments, conducted for example on the International Space Station (ISS), are being made publicly available through NASA's Physical Science Informatics (PSI) database, but the amount of data can be overwhelming. It can be hard to find, harder to compare, and harder yet to interpret.
>
> Your challenge is to build an SI-powered, web-based dashboard that summarizes, ranks, and interprets combustion science investigations to deliver critical foundational insights for fire safety. You may consider enabling users to:
>
> * Identify investigations most relevant to the fire safety needs of habitable crew environments, including spacecraft, space stations, bases on the lunar and Martian surfaces, and pressurized rovers.*
> * Extract data that supports predictive modeling of flammability and fire scenarios in space exploration.
> * Highlight research that informs the development of next-generation fire safety controls and equipment.
>
> In this challenge, you'll help turn complex data into clear answers and make the next giant leap a safer one.
>
> Your dashboard could also address potential applications of the PSI data to fire safety on Earth. Fine-water-mist extinguishers developed for use on the ISS have practical applications here on Earth, and NASA technology has similarly led to improvements in terrestrial smoke detection and firefighter gear, including protective clothing and air tanks.
>
> *Fire safety involving rockets and propellants is generally beyond the scope of the research available in the PSI database. The high velocities within rocket engines render the combustion effectively independent of gravity — although a rocket's launch is of course strongly dependent on gravity.
>
> **Potential Considerations**
>
> You may (but are not required to) consider the following:
>
> * Your target audience can include professors, graduate students, undergraduate students, aerospace researchers, and aerospace engineers.
> * Consider how you might summarize and display attributes such as:
>    * Experimental objectives
>    * Fuels, including shape and size of the samples or burners
>    * Other test conditions, such as oxygen concentration and airflow speed
>    * Variables: how did tests from the same investigation differ and how were they the same?
>    * Sensors or types of measurements
> * Consider how to summarize and display similarities and differences between different investigations.
> * Other investigations in PSI
>    * One of the instruments used for smoke detection in the SAME and SAME-R studies was instead used to detect dust in the Dust and Aerosol Measurement Feasibility Test (DAFT and DAFT-2) studies.
>    * While it burned gaseous fuels, the Burning Rate Emulator (BRE) experiment of the Advanced Combustion via Microgravity Experiments (ACME) project was a study of materials flammability in still atmospheres as a function of material properties.
>    * Other combustion investigations within the PSI database (but not explicitly referenced above) are still relevant to fire safety, just not as strongly or directly.
> * Hardware
>    * The six experiments in the ACME project featured flames of gaseous fuels and were all conducted with the same modular set of ACME hardware in the Combustion Integrated Rack (CIR).
>    * FLEX, FLEX-2, and the Cool Flames Investigation (CFI) each featured burning droplets of liquid fuel and were conducted with the Multi-user Droplet Combustion Apparatus (MDCA) in the CIR.
>    * BASS, BASS-II, the Smoke Point In Co-flow Experiment (SPICE), and the Structure & Liftoff In Combustion Experiment (SLICE) collectively featured both solid and gaseous fuels. Each of these investigations was conducted within the Microgravity Science Glovebox (MSG) using the modular fan-driven flow duct built for SPICE.
> * Spacesuits and oxygen concentration
>    * To enable flexibility, spacesuits are filled with 100% oxygen to only 4.3 psi (pounds per square inch), where the Earth's pressure at sea level is 14.7 psi.
>    * To avoid the bends (decompression sickness), the astronauts pre-breathe 100% oxygen to expel absorbed nitrogen.
>    * To reduce the pre-breathing duration and thus facilitate lunar excursions, it is expected that the Moon Base and pressurized rover(s) will be at a pressure and oxygen concentration between those in a spacesuit and the Earth's atmosphere.
>    * The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less. Compared to Earth's atmosphere, that's more than a 40% increase in the oxygen concentration making materials much more flammable.
>    * Microgravity tests with the highest oxygen concentrations were conducted as part of the ACME's Cool Flames Investigation with Gases (CFI-G). In those tests, the combustion chamber was filled with a mixture of nitrogen and a flammable gas (e.g., propane), while an oxygen-nitrogen mixture of up to 85% oxygen flowed from the spherical burner creating an inside-out flame.
> * Partial-gravity data
>    * Although NASA is heavily focused on the return of astronauts to the Moon's surface and the establishment of a Moon Base in preparation for the future human exploration of Mars, there is currently no partial-gravity combustion data available in PSI. We expect such data will be added in the future, for example from the Lunar-g Combustion Investigation (LUCI) and the Flammability of Materials on the Moon (FM2) experiment.
>    * Partial gravity was mimicked in ACME's Electric-Field Effects on Laminar Diffusion Flames (E-FIELD Flames) experiment through the effect of the electric field on the ions that naturally occur in flames.
>    * Microgravity and normal-gravity results could bound what occurs at intermediate gravity levels.
>
> Next up, are the resources for this hackaathon/ challenge: (remember timer of 48 hours overall is given starting now when the resoiurces are also released)
>
> https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation
> https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
> https://www.youtube.com/watch?v=W1oXykoz9zg
> https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/
> https://sma.nasa.gov/sma-disciplines/accllp/apollo-1
> https://sma.nasa.gov/sma-disciplines/accllp/apollo-13
> https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/
> https://spinoff.nasa.gov/node/9582
> https://spinoff.nasa.gov/node/9407
> https://spinoff.nasa.gov/node/9918
>
> Accoridngly, review everythign and then likewise tell me the entire framework for this competition, and also give like a proper full-fledged summary to all the complex scientfici concepts everything A-Z tell about this competition before we can actually proceed to construct the cdeliverbable of the challenge...
> EXECUTE.

The second message (14 Nov 2026, 07:51 UTC), word for word:

> I am going to export this current/ ENITRE chat somewhere else, so give a detailed A-Z of it PROPER DO NOT MISS ANYTHING. execugtre

This file answers that second message.

---

## C. What was done in this thread

1. **Opened a guide doc** with an outline of 13 sections, then filled it in section by section.
2. **Read all 10 resource links.** Eight were read in full. Two couldn't be:
   - **PSI search page:** it's a JavaScript app, so only an empty page shell came back, and our cloud server's network proxy blocks the domain (HTTP 403). An attempt to fetch it through Ayan's linked computer failed because the computer wasn't connected at the time. Covered instead with NASA's PSI investigations list (19 combustion investigations) and the PSI database user guide.
   - **YouTube video:** only the title ("NASA ScienceCasts: The Power of Studying Combustion on the ISS"), channel (NASA Science) and description came back. No transcript.
3. **Pulled extra sources** the challenge assumes you know: the Space Apps judging guide and submission guide, the full Researcher's Guide to Combustion Science PDF, the Saffire IV and V results paper, the SAME summary, the ACME mission page, the Universe Today write-up on ACME's results, the UMD release on CFI-G cool flames, the UC San Diego article on FLEX, and Aerospace America on the Artemis II smoke alarm.
4. **Wrote the guide.** Part 1 is the winning framework: verdict, sources, judging, scope, PSI data pipeline, the SI layer, team roles, the 48-hour plan, demo and submission, and traps. Part 2 is the science primer: 16 core ideas, an A-Z glossary, all investigations, hardware, historical fires and Earth spinoffs. It ends with the key question and the sources. The full text is in section H.
5. **One correction made while writing:** an unsupported "70% of teams" figure in the traps list was changed to "most teams".
6. **Saved project memory** so later threads keep the clock, the strategy, the doc link and the PSI facts.
7. **Delivered the guide** with a summary message, quoted below.

The delivery message, as sent:

> Your guide is finished: Project Redshift: Flame in Freefall Winning Guide. Part 1 is the plan to win and Part 2 is the full science primer.
>
> My blunt recommendation: don't build a chatbot. Most teams will, and it looks like every other entry. Build a habitat-first fire safety atlas instead. A user picks an environment, like the Moon base at 30% oxygen and 10.2 psi, and the dashboard ranks the 19 NASA combustion investigations for that environment. Every claim cites its source. The headline chart plots oxygen against pressure for every condition NASA has tested, so you can see that nobody has burned a large sample at Moon-base conditions in microgravity.
>
> Things to sort out in hour one: the PSI search page and the YouTube video wouldn't load for me, so open the PSI page yourselves to confirm the list. CFI-G, CLD Flame and Flame Design are named in the challenge but weren't in that list, so check whether PSI has their data. PSI has no API, so plan two people for a manual data harvest in the first 8 hours. The demo is capped at a 30-second video or 7 slides, and a public link is required; either breach disqualifies you from global judging. Confirm your exact deadline with your Local Lead. I've assumed 12:47 PM IST on Monday 16 Nov.
>
> The question to ask isn't "how do we build an SI dashboard?". It's "what will a NASA fire engineer learn from us in 30 seconds that would take them a day in PSI?"
>
> Tell me what to change in the doc, or say go and I'll start on the build plan. I won't write any code until you say so.

---

## D. The recommendation in brief

- **Build a scenario-first fire safety atlas, not a chatbot.**
- **The user picks a habitat:** the ISS, a lunar base at 30% O2 and 10.2 psi, a pressurized rover, a spacesuit, or custom settings.
- **The dashboard ranks the 19 PSI combustion investigations** for that habitat using a transparent formula. The weights are adjustable with sliders.
- **Five views ship in the MVP:**
  1. Scenario picker
  2. Ranked investigations
  3. Coverage-gap map of O2 against pressure (the hero chart)
  4. Compare view
  5. Ask Redshift: cited answers with a confidence label and a "what's missing" line
- **The AI summarizes and explains verified records. It never makes up science.** Every claim cites its PSI investigation.
- **Cut:** an ML flammability predictor (19 records is not a training set), 3D or VR, a partial-gravity simulator, user accounts, processing raw PSI video, and anything about rockets or propellants.
- **The headline insight:** the Moon base has about the same oxygen partial pressure as Earth (about 3.1 psi) but a higher oxygen fraction. That means less nitrogen to absorb heat, so materials are more flammable. The closest large-scale test is Saffire V (about 26% O2 at about 10.4 psi). Nobody has tested 30% O2 at 10.2 psi at scale in microgravity.
- **The question to ask:** "What will a NASA fire safety engineer learn from Redshift in 30 seconds that they couldn't learn from PSI in a day?"

---

## E. Hour-one checks and open questions

1. **Confirm the exact deadline** with your Local Lead. The official guide shows a generic "Sunday 11:59 pm local time", while you said 48 hours from 12:47 PM IST on 14 Nov.
2. **Open the PSI search page in your own browser** and confirm the list of 19 combustion investigations.
3. **Check whether PSI has data for CFI-G, CLD Flame and Flame Design.** The challenge names them, but they weren't in the PSI list we could read. If they're missing, say so in the dashboard.
4. **Register on PSI.** Downloads may need an account.
5. **Watch the YouTube ScienceCast** as a team. It takes about 5 minutes and helps with tone.
6. **Confirm team size and roles,** one to six members, all registered on the Members tab.
7. **Decide the stack:** React and Vercel if someone is comfortable with React, otherwise Streamlit.
8. **Verify every seed number** for the gap map against PSI before it ships.
9. **Unknown cause:** the Artemis II smoke alarm's cause hasn't been reported, so don't state one.

---

## F. Current status and next steps

- **Done:** research, the full guide, the project memory and this export.
- **Waiting on Ayan:** approve the plan or ask for changes. Then say "go" for the next step: the repo layout, the JSON schema and the extraction prompt.
- **No code has been written,** by Ayan's rule to ask first.
- **No repository is attached** to the project yet. One is needed once building starts.
- **The guide doc stays open** for edits and comments: https://claude.ai/artifact/GwfddDi731ydyDEWHBnQXD

---

## G. Extra research notes not in the guide

These are details gathered while reading the sources that didn't make it into the guide.

**Glenn Combustion Science page**

- NASA Glenn Research Center in Cleveland, Ohio, runs the program.
- Combustion supplies about 85% of delivered energy in the US.
- A flame (about 2,300 K) and room air (about 300 K) differ about eightfold in density over about 1 cm.
- Combustion involves hundreds of chemical species and thousands of reactions, and has been studied for over 80 years.
- **SoFIE** (Solid Fuel Ignition and Extinction) studies fire growth. Expedition 67 astronaut Samantha Cristoforetti reconfigured its parts. SoFIE launched in February 2022 and replaced ACME in the CIR.
- **FLARE** (Flammability Limits At Reduced-g Experiment) links ground and microgravity flammability limits. Partners include JAXA, NASA, ESA, CNES, DLR and universities in Japan, France, Germany and the US.
- **FM2** is described as the first combustion experiment on another planetary body, at 1/6 g.
- **SAME's framing:** hydrocarbon fuels produce soot, while plastics produce droplets of recondensed polymer.
- **SPICE** continued the Laminar Soot Processes work flown on STS-94.

**Researcher's Guide (October 2015 edition)**

- **Authors:** Gokoglu, Dietrich, Stocker, Olson and Hicks (NASA Glenn), and Ferkul (USRA).
- **The Microgravity Science Glovebox (MSG)** has operated since July 2002 and has logged more than 10,000 payload hours.
- **SAMS and MAMS** measure station acceleration. SAMS covers vibration, MAMS covers quasi-steady disturbances below 0.01 Hz.
- **BASS examples:**
  - A 2 cm acrylic sphere burned at 17% O2 in a 10 to 12 cm/s flow.
  - A cotton-fiberglass sample burned for 90 seconds while the flow was stepped down from 10 cm/s to under 1 cm/s.
- **Nitrogen jets:** nitrogen applied locally can strengthen a flame by pulling in fresh oxygen.
- **SoFIE plan:** PMMA or Delrin samples, each burned, extinguished and re-ignited several times.
- **Low-stretch flames:** radiation sets a flammability boundary much lower than theory predicted.
- **SOFBALL flame balls:** flames of about 1 W that burned for over 40 minutes.
- **Water mist:** nine non-toxic portable water-mist extinguishers were planned, and the first two reached the ISS in December 2015.
- **New smoke detector:** it senses particles and gases together, and beat aircraft smoke detectors in joint FAA tests on both false-alarm rejection and real detection.
- **Equipment table:** the guide also lists planned SoFIE experiments (Flame Spread, GEL, Narrow Channel, SMμRF, MIST) and FLEX-ICE-GA and FLEX-2J for the MDCA.
- **PDF:** https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf
- **EPUB:** https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity.epub

**ACME (Universe Today, June 2022)**

- **Scale:** in-orbit testing ran from 2017 for about 4.5 years, with more than 1,500 flames, over three times the plan.
- **Who ran it:** about 50 support staff and more than 30 crew members from 6 countries. Tests were commanded from Glenn's ISS Payload Operations Center.
- **CLD Flame** produced benchmark data at the sooty and highly diluted extremes.
- **E-FIELD** suggested electric fields could cut emissions.
- **s-Flame** recorded flame growth and extinction data for models.

**CFI-G cool flames (UMD)**

- Fuel was n-butane diluted with nitrogen, burned in 40% O2 at 2 atm.
- More than 150 hot flames burned from January to June 2021 without turning into cool flames.
- On 23 June 2021, in 3 tests, leftover heat in the burner re-ignited the fuel as a steady spherical cool flame.
- Cool flames burn at about 600 to 1,000 K, against 1,100 to 2,200 K for hot flames. Their reaction zones are about 6 mm thick.

**FLEX (UC San Diego)**

- FLEX ran from March 2009 to December 2011.
- Each droplet burned for about 20 seconds.
- The CIR is about the size of a 5.5-foot bookcase and weighs close to 560 lb.
- Flames in space burn cooler, slower and with less oxygen, so extinguishing agents must be used in higher concentrations.

**Saffire IV and V (ICES 2021 paper)**

- **Samples:**
  - Each sample was 40 cm wide and 18 to 50 cm long.
  - SIBAL fabric weighed 18.05 mg/cm² and cotton jersey 18.1 mg/cm².
  - PMMA was 5 mm thick (one-sided) or 10 mm (two-sided), plus one ribbed sample.
- **Conditions:**
  - Airflow was 20 cm/s, cut to 5 cm/s in some tests. Heat release reached up to 10 kW.
  - Saffire IV ran at 22.0% O2 and 100.0 kPa. Saffire V ran at 25.4 to 26.2% O2 and 70.7 to 72.6 kPa.
- **Flame size and spread:**
  - Steady flame sizes were 4 cm (Saffire I and II), 5 cm (II-6 and III-1), 8.5 cm (IV-1) and 10 cm (V-2).
  - Cutting the duct height from 46 cm to 30 cm roughly doubled the concurrent spread rate.
  - Near the duct entrance, flames overshot their steady size by about 30%.
  - On the ribbed PMMA, spread slowed as the ribs got wider (1 to 10 mm).
  - In thick fuels, flames upstream can starve the flames downstream of oxygen.
- **Re-ignition:** cotton (V-2) re-ignited after a 70-second flow shutoff and burned another 150 seconds. Bubbling PMMA (IV-2) kept burning through a 15-second no-flow period.
- **Extinction:** cutting the flow to 5 cm/s for 300 seconds before shutoff put out V-3 and V-4 at once, but the authors caution against relying on this.
- **Deflagration:** V-4 ignited after 10 minutes of preheating and filled the camera view within 100 ms.
- **Monitoring:** six remote thermocouple and CO2 sensors plus FFD smoke and aerosol sensors. Average cabin conditions stayed acceptable.
- **Source inconsistencies:** the paper lists Nomex in Figure 2 but not among the completed tests. Its text says the duct went from 25 to 15 cm, while its tables say 30 cm.

**SAME and SAME-R (NASA summary)**

- **SAME** flew on Expedition 15. It tested 30 samples, six each of Teflon, Kapton, silicone rubber, cellulose, and dibutyl phthalate on a wick, varying flow, heating temperature and smoke aging time.
- **Particle sizes:** silicone rubber smoke had a mean diameter of 227 nm, yet nearly half its mass was above 1,000 nm. The summary also says all mean diameters fell between 100 and 200 nm, which contradicts the 227 nm figure.
- **SAME-R** flew on Expedition 24 (July to September 2010) and tested Teflon, Kapton, cotton, silicone rubber and Pyrell.
  - **Instruments:** a thermal precipitator collected particles for electron microscopy. Moment instruments measured number, diameter and mass. A commercial detector was flown alongside the ISS and Shuttle detectors. A scanning mobility particle sizer (SMPS) was used on the ground only.
- **Old detector limits:** the Shuttle's ionization detector had a separator that excluded particles above about 1 to 2 µm. The ISS detector uses near-infrared forward scattering.
- **Incident history:** the Orbiter fleet had six component overheating failures and the ISS several incidents. None became a real fire.

**Historical fires, extra details**

- **Apollo 1**
  - The crew were Gus Grissom, Ed White and Roger Chaffee, at Launch Pad 34.
  - The Apollo 204 Review Board used 21 panels and released a 3,000-page report on 9 April 1967.
  - Changes that followed:
    - Block II spacecraft for all later crews.
    - A single-piece hatch that opens in 3 seconds.
    - Limits on combustible materials, including in the Lunar Module.
    - Fire-resistant spacesuits.
    - Management and safety culture changes.
- **Apollo 13**
  - The heater voltage was raised from 28 to 65 V DC in 1965, but the thermostats weren't upgraded.
  - The tank was damaged by about 8 hours of overheating. It exploded after a 49-minute TV broadcast and also damaged tank 1.
  - Oxygen vented for about 14 minutes, and the Command Module had about 15 minutes of power left. The crew used the Lunar Module Aquarius as a lifeboat.
  - Water was rationed to 6 ounces per person per day.
  - Splashdown was 17 April 1970, and the board's report came out 15 June 1970.
  - Fixes from Apollo 14 on:
    - A third oxygen tank.
    - Better thermostats.
    - Stirring fans removed.
    - Wiring sheathed in stainless steel.
- **Mir, 24 February 1997**
  - Six crew were aboard during a handover. Aleksandr Lazutkin lit the oxygen candle in the Kvant-1 module.
  - Valeri Korzun fought the fire while Jerry Linenger held him in place.
  - The station structure wasn't damaged, though some panels were charred.
  - Russian crew training, ground response and oxygen candle preparation were all changed afterward.
  - The ISS now relies on three Elektron units and a US oxygen system, with oxygen candles kept only as a backup.
- **Artemis II (2026, nine-day mission)**
  - The detector tripped on the second-to-last day, about 80,000 miles from Earth.
  - Commander Reid Wiseman: "It wasn't scary, but it was tense for a few minutes until we got things reconfigured."

**Spinoffs, extra details**

- **Air tanks:** published in 1976, developed with JSC, and commercialized by A-T-O Inc.'s Scott Aviation.
  - The design uses an aluminium liner wrapped in resin-soaked glass fibre.
  - It came with a wider-view mask and a low-air alarm only the wearer can hear.
  - Structural Composites, Boeing and Martin-Marietta found other uses for the technology.
- **Fire detector:** published in 1978 and based on the Brunswick Incipient Fire Detector from the Shuttle. Several sensors connect to a central fire-watch display.
- **Project FIRES:** sponsored by NASA and the US Fire Administration (part of FEMA), managed by Marshall Space Flight Center.

**Space Apps rules, extra details**

- **Judging stages:** local judges, then Global Nominees (about 1 per 10 projects), then Global Finalists chosen by NASA and partner experts, then winners chosen by an executive panel.
- **Global awards (10):** Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology, and Local Impact.
- **Required submission fields:** Project Name, High-Level Project Summary, Link to Project Demo, Link to Final Project, Detailed Project Description, NASA Data, Space Agency Partner & Other Data, Use of Artificial Intelligence, and Project Submission Verification.
- **Rules:**
  - Everything must be in English.
  - The work must be original, with all external resources listed in References.
  - Submissions go through a review for prohibited activity with the People's Republic of China.
  - "Create Your Own Challenge" entries can't go to Global Judging.
- **AI-generated media:** audio, code and data must be acknowledged in descriptive text and metadata, and images and video need a visible watermark.

---

## H. The full guide

What follows is the complete text of the guide doc, exported as it stands now.

---

# Project Redshift: Flame in Freefall Winning Guide

Nov 14, 2026 · @Ayan

## The verdict

Build a **scenario-first fire safety atlas**, not a chatbot. A user picks a habitat (ISS, lunar base at 30% O2 and 10.2 psi, pressurized rover, spacesuit) and the dashboard ranks the 19 PSI combustion investigations by how much they tell you about fire in *that* environment. Each result shows its evidence, a citation and an honest "what we don't know yet".

The winning exhibit is one chart: oxygen concentration against pressure, with every tested condition plotted and the Moon base marked. It shows at a glance where NASA's data covers future habitats and where it doesn't. Judges remember one picture. Make it this one.

The thinking, Munger-style: invert first. Most teams in this challenge will lose by building a generic "ask the AI about fire" chat box over scraped text. It hallucinates, it can't be scored on Validity, and it looks like every other entry. Your edge is **structured, verified data plus a transparent ranking**. The AI writes the summaries and explanations on top of that. It never stands in for it.

First, three facts that change the plan:

- **PSI has no documented API.** Data comes as manually downloaded files from each investigation page ([PSI database guide](https://science.nasa.gov/wp-content/uploads/2024/11/psi-database-guide.pdf)). Two people must hand-harvest metadata in the first 8 hours. Don't plan on scraping it.
- **The demo video is capped at 30 seconds** (or 7 slides) and must have English subtitles. Go over and you're out of Global Judging ([submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)).
- **Presentation carries equal weight** with Impact, Creativity, Validity and Relevance ([judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)). A beautiful, honest, narrow product beats a sprawling one.

## Sources reviewed

I read all 10 links. The PSI search page and the YouTube video couldn't be read in full, so I covered both from other sources. Full links are in the Sources section at the end.

| Resource | Status | What it gave us |
| --- | --- | --- |
| [PSI combustion search](https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation) | **Not readable.** It's a JavaScript app, and our server's proxy blocks the domain | Covered instead by NASA's [PSI investigations list](https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/) (19 combustion investigations) and the [PSI database guide](https://science.nasa.gov/wp-content/uploads/2024/11/psi-database-guide.pdf). **Open it in your own browser in hour 1 to confirm the list.** |
| [Glenn combustion science](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/) | Read | Program overview, FM2, SoFIE, FLARE, CIR, MDCA, NASA-STD-6001 |
| [YouTube ScienceCast](https://www.youtube.com/watch?v=W1oXykoz9zg) | **Only the title and description came through.** No transcript | "The Power of Studying Combustion on the ISS". Watch it as a team for 5 minutes, since it's useful for tone |
| [Researcher's Guide to Combustion](https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/) | Read the landing page and the full PDF | The best single technical source: hardware specs plus FLEX, BASS and ACME findings |
| [Apollo 1](https://sma.nasa.gov/sma-disciplines/accllp/apollo-1) | Read | 100% O2 cabin, wire arcing, CO asphyxia, hatch redesign |
| [Apollo 13](https://sma.nasa.gov/sma-disciplines/accllp/apollo-13) | Read | Heater thermostat mismatch, damaged Teflon insulation, O2 tank explosion |
| [Mir fire](https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/) | Read | SFOG oxygen candle fire, 1997, three extinguishers, dense smoke |
| [Spinoff 9582](https://spinoff.nasa.gov/node/9582) | Read | Lightweight firefighter air tanks |
| [Spinoff 9407](https://spinoff.nasa.gov/node/9407) | Read | Incipient fire detector that tells combustion particles apart from dust |
| [Spinoff 9918](https://spinoff.nasa.gov/node/9918) | Read | Project FIRES protective clothing for firefighters |

I also pulled extra sources for things the challenge assumes you know: Space Apps judging and submission rules, Saffire IV and V results, the SAME smoke data, the ACME results and the CFI-G cool flames.

Two things to check yourselves:

- **Your deadline.** The official guide still shows the generic "Sunday 11:59 pm local time". You said the clock runs 48 hours from about 12:47 PM IST on 14 Nov, which ends **12:47 PM IST on Mon 16 Nov**. Confirm the exact cutoff with your Local Lead today.
- **CFI-G, CLD Flame and Flame Design** are named in the challenge, but they're missing from the 19-item PSI list I could read. Only ACME BRE, E-FIELD and s-Flame appear. Check in the live PSI whether those datasets exist. If they don't, your dashboard should *say so*, and that honesty is a Validity win.

# Part 1: The winning framework

## How judging works and what wins

Judges score five criteria, and the official guide says presentation gets "equal attention" with the other four. No weights are published, so treat them as equal ([judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)).

| Criterion | The judge's question | How Redshift scores high |
| --- | --- | --- |
| Impact (Influence) | How much good could this do? | Name the real user: a habitat engineer choosing cabin fabric for a 30% O2 lunar base. Show the decision your tool speeds up. |
| Creativity | How new is the approach? | The scenario ranker and the coverage-gap map. Nobody else will plot NASA's tested conditions against future habitat atmospheres. |
| Validity | Is the science right? | Every claim cites its PSI investigation, the ranking formula is visible, and data gaps are labelled as gaps. No made-up predictions. |
| Relevance | Does it answer this challenge? | Hit the challenge's three verbs exactly: **summarize, rank, interpret**. Cover the three named uses: habitats, predictive modelling data and next-generation equipment. Add one Earth spinoff panel. |
| Presentation | Did they communicate? | A 30-second video with one clear story, a clean submission page, and a live link that works in an incognito window. |

**The process.** Local judges pick roughly one Global Nominee per ten projects. NASA and partner experts then choose Global Finalists, and an executive panel picks the winners. **Judges mainly read your project submission page.** The demo counts, but less ([submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)). Write that page like a product launch.

**Awards to target:** Best Use of Data (the obvious fit), Best Use of Science (if Validity is airtight) and Galactic Impact (via the Moon-base story).

**The rules that can disqualify you:**

- The demo is a video of **30 seconds or less**, or **7 slides or fewer**, with English subtitles. Host it externally on a public link.
- The final project link must be public, with no login, password or permission request.
- You must use NASA data and describe how in the NASA Data field.
- **AI use is allowed but must be disclosed** in the AI field. AI-generated images and video need a visible watermark, and AI content may not use or modify NASA branding. **Don't put the NASA meatball logo in your app.**
- One to six members, all registered and on the Members tab, before submission closes.

## Scope: what the MVP is, and what it isn't

Thinking about it the way Jobs would: the product is **one question answered beautifully**. *"I'm designing a habitat at these conditions. What does NASA's fire data tell me, and what doesn't it?"* Every screen serves that question. Everything else gets cut.

**Must ship (the five views):**

1. **Scenario picker (home).** Five preset environments, plus custom sliders for O2 %, pressure in psi, airflow in cm/s and gravity. Picking one drives everything else.
2. **Ranked investigations.** The 19 PSI investigations sorted by relevance score. Each card shows its fire safety pillar (prevention, detection or suppression), fuel type, conditions and a one-line "why it matters for your scenario". Clicking the score shows the formula behind it.
3. **Coverage-gap map (the hero).** A scatter of O2 against total pressure, with every tested condition plotted, a dot for each habitat, and shading for where data exists. Add a second small chart of airflow against O2.
4. **Compare view.** Pick two to four investigations and see them side by side: objective, fuel and sample geometry, O2, pressure, flow, what changed between tests, sensors and key finding. This is exactly what the challenge's "Potential Considerations" list asks for.
5. **Ask Redshift.** A question box that answers *only* from your verified knowledge base, with inline citations and a confidence label. It sits in a side panel and isn't the whole product.

**Nice to have, only once the five are done:** an Earth spinoffs panel (water mist, detectors, air tanks, gear), a historical fires timeline, and plots of one real experiment table (BASS or FLEX) showing "how the tests in this investigation differed".

**Cut, no debate:**

- A machine-learning "flammability predictor". With about 19 investigations you have no training set, and a judge from Glenn will spot it in seconds. Show **data that supports** predictive modelling, which is what the challenge asks for, and don't build a model.
- 3D or VR flames, a partial-gravity "simulator", and user accounts.
- Processing raw PSI video or images at scale.
- Rocket and propellant fire. The challenge rules it out of scope.

**Seed data for the gap map** (verify each point against PSI before shipping). Note that oxygen *partial pressure* is the % times the total pressure:

| Environment or test | O2 (%) | Total pressure (psi) | O2 partial pressure (psi) | Source |
| --- | --- | --- | --- | --- |
| Earth sea level, ISS cabin | 21 | 14.7 | 3.1 | Challenge text |
| Planned Moon base or rover | 30 or more | 10.2 or less | 3.1 | Challenge text |
| Spacesuit | 100 | 4.3 | 4.3 | Challenge text |
| Saffire IV | 22 | 14.5 (100 kPa) | 3.2 | [Saffire IV/V paper](https://ntrs.nasa.gov/api/citations/20210011521/downloads/ICES%202021-266%200503-2021%20final.pdf) |
| Saffire V | 25.4 to 26.2 | 10.3 to 10.5 (70.7 to 72.6 kPa) | about 2.7 | Same paper |
| BASS | 17 to 21 | 14.7 | 2.5 to 3.1 | [Researcher's Guide](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf) |
| MDCA range (FLEX, CFI) | up to 40 | 0 to 44 (0 to 3 atm) | varies | Same guide |
| FLEX-2 example | 30 | 35 (2.4 atm) | 10.6 | Same guide |
| CFI-G butane cool flames | 40 | 29 (2 atm) | 11.8 | [UMD release](https://fpe.umd.edu/release/unusual-flames-discovered-aboard-the-international-space-station) |

**The insight to put in the video:** the Moon base has the *same* oxygen partial pressure as Earth, yet it's more flammable. There's less nitrogen to soak up heat, so flames burn hotter and spread faster. Saffire V, at about 26% O2 and about 10.4 psi, is the closest large-scale test to that atmosphere. Nobody has burned a large sample at 30% and 10.2 psi in microgravity, and that gap is your story.

## Data pipeline from PSI

The pipeline is **manual harvest, AI-assisted extraction, human verification, then static JSON**. Thinking like Musk about where the cost really is: the hard part isn't code. It's turning 19 messy investigation pages into one consistent table. Spend your people there.

**What PSI actually gives you.** Each investigation page has the same sections: Overview (PSI ID, title, acronym, DOI, research area), Investigation Description (objectives, approach, hypothesis, dates), an **Experiment Table** of sample and run details (downloadable), Hardware links, Representative Images, Data Files (Raw and Analyzed, split into reduced and Earth gravity), Publications and Version History. There's no API. You download by ticking boxes, and registration may be required ([PSI database guide](https://science.nasa.gov/wp-content/uploads/2024/11/psi-database-guide.pdf)).

**The steps:**

1. **Harvest (hours 2 to 8, two people).** Register on PSI in hour 0. Split the 19 investigations between two people. For each one, save the page text as Markdown, download the Experiment Table, and record the publication titles and DOIs. Skip raw video and image files, except for one representative image per investigation for its card. Put everything in a shared folder named by acronym.
2. **Extract (hours 6 to 12).** Have an LLM fill a fixed JSON schema for each investigation from the saved text. Use structured output and forbid it from guessing: every field it can't find is `null`.
3. **Verify (hours 8 to 14, science lead).** A human checks every field against the source and adds a `source_quote`. This step is what makes you stand out on Validity. Don't skip it.
4. **Enrich.** Add your own derived fields: O2 partial pressure, fire safety pillar, habitat tags, and a "directness" rating (direct, indirect or foundational) based on the challenge text, which tells you BASS, Saffire, SAME and FLEX are the most direct.
5. **Ship.** Commit the dataset to the repo as `investigations.json`, plus `chunks.json` for retrieval. No database is needed. 19 records load instantly.

**The schema for each investigation:**

```json
{
  "id": "BASS-II", "psi_id": "PSI-…", "title": "…", "doi": "…",
  "pillar": ["prevention", "suppression"],
  "hardware": "MSG + SPICE duct",
  "fuel_phase": "solid", "fuels": ["PMMA", "cotton-fiberglass"],
  "sample_geometry": "flat 2 cm; 2 cm sphere",
  "o2_pct": [17, 21], "pressure_psi": [14.7, 14.7], "flow_cm_s": [0, 40],
  "diluents": ["N2"],
  "variables_changed": ["flow speed", "O2 via N2 dilution"],
  "held_constant": ["pressure"],
  "sensors": ["color video", "radiometer"],
  "key_findings": [{"text": "…", "source_quote": "…", "source_url": "…"}],
  "habitat_relevance": {"iss": 0.9, "lunar_base": 0.6, "rover": 0.6},
  "data_files": ["experiment_table.csv"],
  "gaps": ["no tests above 21% O2"]
}
```

Treat the values above as an illustration of format, not as verified facts. Your verify step fills in the real ones.

**The stack.** Use Vite with React and TypeScript, Tailwind, and Plotly or Recharts for the charts. Deploy on Vercel. Add one serverless function that calls the LLM so your API key stays server-side. If no one on the team is comfortable with React, use Streamlit instead, and accept that it'll look generic, which costs you on Presentation.

## The SI layer: summarize, rank, interpret

The rule that keeps you honest: **the AI is a writer and a librarian, never an oracle.** It summarizes and explains verified records. Ranking comes from a formula a human can audit.

**Summarize (written ahead of time, not live).** At build time, generate three layers for each investigation: a 1-line summary for the card, a 1-paragraph version for students, and a technical version for engineers. Have the science lead review all 57. Since they're stored as static text, the demo can't hallucinate in front of the judges.

**Rank (a transparent formula, computed in the browser).** The score for investigation *i* in scenario *s* is:

```latex
S_{i,s} = w_1 \cdot \text{Proximity}(O_2, P, \text{flow}) + w_2 \cdot \text{Pillar} + w_3 \cdot \text{Material} + w_4 \cdot \text{Directness} + w_5 \cdot \text{Richness}
```

- **Proximity:** how close the tested conditions come to the scenario's O2, pressure and airflow. Normalize each axis and use exp(−distance).
- **Pillar:** does it match what the user wants (prevention, detection or suppression)?
- **Material:** do the fuels resemble habitat materials (fabrics, plastics, wiring insulation)? Solids beat gas burners, and gas burners beat droplets.
- **Directness:** direct, indirect or foundational, per the challenge text.
- **Richness:** how much downloadable data exists (experiment table, analyzed data, publications).

Show the weights as sliders. **That one detail does two jobs.** It makes the ranking transparent for Validity, and it lets a researcher re-weight for their own question, which is your Impact story.

**Interpret (live, but grounded).** Ask Redshift works like this:

1. Retrieve the top chunks from your verified knowledge base. Plain keyword search plus small embeddings is enough for 19 records.
2. Pass the current scenario as context.
3. The system prompt requires a citation for every claim. If the sources don't cover the question, the model must reply "PSI data doesn't cover this" and name the closest investigation.
4. Output follows a fixed template: **Answer, Evidence (cited), Confidence (high, medium or low), What's missing.**

The "What's missing" line is your differentiator. For example: *"No PSI data exists at partial gravity. Bound it with microgravity (BASS, Saffire) and 1-g results. LUCI and FM2 will fill this gap."*

**Model choice.** Any current frontier model with structured output and a long context will do. A current Claude model is a strong default. Pre-compute everything you can, so live calls stay cheap and fast. Also cache the answers to your demo questions in case the Wi-Fi dies.

## Team roles

The roles below assume six people. With fewer, merge down the table, but **never merge Science lead into anything**. That person is your Validity score.

| Role | Owns | Hours 0 to 14 | Hours 14 to 46 | If you have 4 people |
| --- | --- | --- | --- | --- |
| Captain and PM | Scope, the clock, the submission page | Lock scope, set up the repo and PSI accounts, check the deadline | Cut features, write the submission text, run link tests | Captain plus storyteller |
| Science lead | Correctness | Read this primer, verify every extracted field | Review all AI summaries and the demo script | Science lead (unchanged) |
| Data lead | The PSI harvest and the JSON | Harvest investigations 1 to 10, then extract | Gap-map data, plots of one experiment table | Data plus SI |
| SI engineer | LLM extraction, summaries, Ask Redshift | Harvest 11 to 19, build the extraction prompt | Retrieval, citations, cached demo answers | Data plus SI |
| Frontend lead | The app | Skeleton, routing, deploy on day 1 | The five views, performance | Frontend plus design |
| Design and story | Look, video, slides | Design system, wireframes, the video storyboard | Polish, the 30-second video, subtitles | Frontend plus design |

Two habits matter. Hold a 10-minute stand-up every 6 hours, where each person says what's done, what's next and what's blocking them. And keep **one shared task board**, where only the captain adds features.

## The 48-hour plan

The clock starts at **12:47 PM IST on Sat 14 Nov** and ends at **12:47 PM IST on Mon 16 Nov**. Plan to **submit at hour 46**, by 10:45 AM Monday. The last two hours are a buffer for the things that always break.

| Hours | IST | Goal | Exit check (done means) |
| --- | --- | --- | --- |
| 0 to 2 | Sat 12:47 to 14:45 | Kick-off. Everyone reads Part 2 for 30 minutes. Register on PSI, confirm the deadline, lock scope and roles, agree the JSON schema | Scope frozen, every person knows their next 6 hours |
| 2 to 8 | Sat 14:45 to 20:45 | Harvest all 19 investigations. Repo, skeleton app and a first Vercel deploy. Design wireframes | 19 folders saved, a "hello world" app live at a public URL |
| 8 to 14 | Sat 20:45 to Sun 02:45 | Extract to JSON, start verifying. Build the catalog card and compare views from the real JSON | `investigations.json` with at least 12 verified records, catalog view working |
| 14 to 19 | Sun 02:45 to 07:45 | **Sleep, in two shifts.** Shift A sleeps 02:45 to 06:45, shift B 03:45 to 07:45 | Nobody codes on zero sleep |
| 19 to 26 | Sun 07:45 to 14:45 | Scenario picker, ranking formula, gap map. Ask Redshift with citations. Science lead finishes verification | All five views working end to end on real data |
| 26 to 32 | Sun 14:45 to 20:45 | Integrate, fix bugs, write summaries, test on mobile. **Feature freeze at 20:45** | Nothing new after this, only fixes |
| 32 to 38 | Sun 20:45 to Mon 02:45 | Polish the UI. Write the submission page text. Script and storyboard the video, record screen captures | Draft submission saved on the Space Apps site |
| 38 to 42 | Mon 02:45 to 06:45 | **Sleep** |  |
| 42 to 46 | Mon 06:45 to 10:45 | Edit the video (30 s or less, subtitled), upload it publicly. Test every link in an incognito window and on a phone. **Submit.** | "Submit for Judging" clicked |
| 46 to 48 | Mon 10:45 to 12:47 | Buffer. Fix only things that are broken. |  |

Two checkpoints decide everything. At **hour 8**, if the harvest isn't done, cut to the 8 most direct investigations: BASS, BASS-II, Saffire I to III, SAME, SAME-R and FLEX. At **hour 26**, if Ask Redshift isn't reliable, ship it with cached answers only and say so in the AI disclosure.

## Demo, video and submission

**The 30-second video is a trailer, not a tutorial.** It has room for one story, so pick the Moon base.

| Seconds | On screen | Subtitle and voice-over |
| --- | --- | --- |
| 0 to 4 | Archive-style title card: "Apollo 1, 1967. 100% oxygen." | "Fire in space has killed before." |
| 4 to 9 | Scenario picker: click "Lunar base, 30% O2, 10.2 psi" | "The Moon base will breathe richer air than any spacecraft today." |
| 9 to 17 | Ranked list animates in. Gap map shows the lunar dot outside the shaded region | "Redshift ranks 19 NASA microgravity fire experiments for your habitat, and shows what's never been tested." |
| 17 to 25 | Ask Redshift: "Will cotton keep burning if we shut off airflow?" The answer cites Saffire V | "Every answer is cited to NASA's PSI data." |
| 25 to 30 | Logo, URL, team name | "Project Redshift. Making the next giant leap a safer one." |

Use real screen recordings, not AI-generated footage. Burn in the subtitles, and don't use NASA logos. If you use archival NASA imagery, list it in References.

**The submission page** is what judges read most, so treat it as your real pitch. Fill each required field like this:

- **High-level summary (3 sentences):** the problem, what Redshift does, and the one insight (the gap at lunar conditions).
- **Project demo:** the video link, public and subtitled.
- **Final project:** the live app URL plus the GitHub repo.
- **Detailed description:** what it does, how it works (with the pipeline diagram), the ranking formula, its benefits and intended impact, the tools used, and what's next (LUCI and FM2 partial-gravity data).
- **NASA data:** list all 19 PSI investigations by PSI ID and DOI, plus the Researcher's Guide and the Glenn pages.
- **Use of AI:** say exactly where AI was used: extraction (human-verified), pre-written summaries (human-reviewed), live Q&A (grounded, cited) and any coding help.
- **References:** every library, image and paper you used.

## Traps to avoid

Inverting the problem, Munger-style: these are the ways teams lose this challenge, roughly ordered by how often they happen.

1. **The chat box is the whole product.** Wrapping an LLM around PDFs is what most teams will ship. It scores low on Creativity and is risky on Validity.
2. **Made-up science.** One wrong number in the demo, such as "flames spread 3x faster at 30% O2" with no source, and a Glenn judge stops trusting everything else. Cite everything, or don't say it.
3. **A fake predictive model.** A neural network trained on 19 rows isn't SI. It's a red flag. The challenge asks you to *extract data that supports* modelling.
4. **Mixing up oxygen % and partial pressure.** The lunar atmosphere has about the same O2 partial pressure as Earth. It's more flammable because of the higher O2 *fraction* and lower diluent. Get this right and you'll sound like an expert.
5. **Claiming partial-gravity data exists.** It doesn't, yet. Say that microgravity and 1-g results bound the Moon's 1/6 g and Mars's 3/8 g, and that E-FIELD mimicked buoyancy with ions.
6. **Rocket and propellant fire.** It's out of scope, as the challenge says. Don't spend a second on it.
7. **Scraping PSI.** It's a JavaScript app with downloads behind checkboxes. Download by hand, which is faster than debugging a scraper.
8. **Breaking the 30-second or 7-slide limit, or using private links.** Either one is an automatic loss at Global level.
9. **NASA branding in AI-generated media.** It's banned. And undisclosed AI use costs you trust.
10. **No deploy until hour 40.** Deploy in hour 6 and redeploy every few hours.
11. **No sleep.** Teams that pull a 48-hour all-nighter ship worse videos. The video is a fifth of your score.
12. **Treating all 19 investigations as equal.** The challenge tells you the ranking. BASS, Saffire, SAME and FLEX are direct, ACME BRE and DAFT are close behind, and the rest are foundational. Your ranking should reproduce that by default, or judges will doubt it.

# Part 2: The science, in plain language

## The core ideas

Read this in order. Each idea builds on the one before. Points marked *(background)* are standard combustion science, not taken from the challenge sources.

**1. What fire is.** Fire needs fuel, an oxidizer (oxygen), heat, and a chemical chain reaction that keeps going. Take away any one of these and it goes out. Every NASA fire safety strategy attacks one of them. Prevention controls ignition sources and chooses less flammable materials. Detection catches the chemistry early. Suppression removes heat or oxygen.

**2. Why gravity shapes flames.** A flame is about 2,300 K, while room air is about 300 K. That makes hot gas around 8 times less dense over roughly a centimeter. On Earth, buoyancy makes that hot gas rise fast, pulls fresh air in at the base, and carries soot and products away. That's why a candle burns as a flickering teardrop ([Glenn](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/)).

**3. What happens without gravity.** In microgravity there's no buoyancy, so nothing rises. Oxygen reaches the flame only by **diffusion**, meaning slow molecular mixing, or by whatever airflow the fans create. The candle becomes a dim blue sphere, cooler and slower. A candle on Mir burned for over 45 minutes, and flames can survive at lower oxygen levels than on Earth ([Researcher's Guide](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf)). Scientists love this, because it turns a messy 3D problem into a near-1D one that computer models can test exactly.

**4. Diffusion flames and premixed flames.** In a *premixed* flame, fuel and air are mixed before burning, as in a gas stove. In a *diffusion* (non-premixed) flame, fuel and oxygen meet at the flame itself. Almost every real fire is a diffusion flame: burning fabric, wiring or a spilled liquid. That's why nearly every PSI investigation studies diffusion flames. An **inverse or "inside-out" flame** flips the usual setup: oxygen flows out of the burner into a fuel-filled chamber, as in CFI-G and Flame Design.

**5. Soot, smoke point and radiation.** Soot is solid carbon formed on the fuel-rich side of a flame. The **smoke point** is the largest flame (or highest fuel flow) that still burns without releasing soot. It's a standard measure of how sooty a fuel is, and it's what SPICE measured. Soot glows and radiates heat. In microgravity, gases move slowly past the flame, so there's more time to form soot *(background)*, which affects both heat transfer and the kind of smoke a detector sees.

**6. Extinction: two ways to die.** A small flame dies of *diffusive extinction*: it can't get enough reactant fast enough. A large, slow flame dies of *radiative extinction*: it loses heat by radiation faster than it makes it. FLEX saw both in burning droplets, and ACME Flame Design showed radiative extinction in larger spherical flames ([Universe Today on ACME](https://www.universetoday.com/156351/fire-acts-strangely-in-microgravity-astronauts-have-lit-more-than-1500-fires-on-the-space-station-to-figure-out-why)).

**7. Cool flames, the surprise.** In FLEX, heptane droplets kept shrinking *after* the visible flame went out. A nearly invisible **cool flame** was still burning, at about 600 to 1,000 K instead of the usual 1,100 to 2,200 K. It runs on different, low-temperature chemistry, and only part of the fuel burns ([Researcher's Guide](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf); [UMD](https://fpe.umd.edu/release/unusual-flames-discovered-aboard-the-international-space-station)). This matters for fire safety: "the flame went out" may not be true. A cool flame can keep producing fuel vapour and toxic partly-burned products, and it's hard to see or detect. CFI then studied this on purpose, and CFI-G produced gaseous cool flames with no heated reactants or ozone.

**8. Droplet combustion.** A burning droplet is the simplest liquid fire, like a fuel spill broken into pieces. The MDCA burns droplets of 1 to 5 mm and films them as they shrink. A classic result is the **d-squared law**: the square of the droplet's diameter shrinks at a steady rate *(background)*. Departures from that law reveal soot, radiation and cool-flame effects.

**9. Flammability limits and the limiting oxygen index.** A material's **flammability limit** is the boundary of conditions where a flame can survive. The **limiting oxygen index (LOI)** is the lowest O2 level that sustains burning. FLEX found the LOI in microgravity is *significantly lower* than in normal gravity, and lower than predicted. BASS found materials burning below Earth limits too. NASA screens spacecraft materials with **NASA-STD-6001 Test 1**, an upward-burning test on Earth. BASS and Saffire both show it **may not be conservative** in microgravity. It flags highly flammable materials, but it can't prove a material is safe in space.

**10. Flame spread: opposed and concurrent.** Flame spreading *against* the airflow is **opposed flow**. It's slow and creeps toward fresh air. Spreading *with* the airflow is **concurrent flow**. It's faster, with hot gas preheating the fuel ahead. On Earth, upward flames keep growing. In microgravity, Saffire found thin-fuel concurrent flames grow to a **limiting length**, about 4 to 10 cm depending on O2 and duct size. Thick PMMA (acrylic) stayed pinned at its leading edge. At very low flow speeds, flames can even spread *upstream* ([Saffire IV/V paper](https://ntrs.nasa.gov/api/citations/20210011521/downloads/ICES%202021-266%200503-2021%20final.pdf)).

**11. Airflow is the hidden variable.** In space, the ventilation fans replace gravity as the supplier of oxygen. The *worst* case for flammability happens at about **10 cm/s**, which is typical spacecraft ventilation. Too little flow and the flame starves. Too much and it gets blown out or cooled. SoFIE covers 0 to 30 cm/s for this reason. Still air isn't safe either: ACME BRE showed materials can burn for **minutes with no airflow**, and a Saffire cotton sample reignited after a 70-second flow shutoff.

**12. Oxygen percentage and pressure.** Two numbers describe an atmosphere: the oxygen **fraction** (%) and the total **pressure**. Multiply them to get the oxygen **partial pressure**, which is what lungs care about. The planned Moon base, at 30% and 10.2 psi, has about the same O2 partial pressure as Earth (about 3.1 psi), so crews breathe normally. **But fires care about the fraction.** With less nitrogen to absorb heat, the flame burns hotter and spreads faster. The higher fraction outweighs the small benefit of lower pressure *(background)*. That's why the challenge says materials become "much more flammable". The spacesuit, at 100% O2 and 4.3 psi, is the extreme case. Astronauts pre-breathe pure O2 before spacewalks to flush out nitrogen and avoid the bends, and an intermediate habitat atmosphere shortens that pre-breathe.

**13. Ignition.** With no convection to cool a hot spot, materials **ignite more easily** in low gravity. The critical heat flux needed for ignition may be as low as *half* the Earth value. Real ignition sources in spaceflight history include arcing wires (Apollo 1), overheated insulation (Apollo 13) and chemical oxygen generators (Mir). One more trap: in Saffire, hot fuel vapours that pile up in still air caused sudden **deflagrations**, a flash across the whole vapour cloud within 100 ms.

**14. Smoke and detection.** Early detection looks for **pyrolysis products**, the vapours and droplets a material gives off as it overheats, well before there's a flame. SAME heated Teflon, Kapton, silicone rubber, cellulose and other materials in microgravity. It found that all of them make plenty of particles **under 1 micrometre**, and that aging smoke reduces particle count while keeping the mass. The catch is that the ISS's light-scattering detector is most sensitive to particles *above* 1 micrometre. **Ionization** detectors catch sub-micron particles well. NASA's lesson was that detectors should cover a wider range of particle sizes ([SAME summary](https://www.nasa.gov/wp-content/uploads/2025/07/smoke-aerosol-measurement-experiment-same.pdf)). Dust triggers false alarms, which is why DAFT measured the ISS's background dust using the same P-Trak instrument.

**15. Suppression.** You can starve a fire of oxygen or take away its heat. FLEX tested **dilution** with CO2, helium, nitrogen and xenon. Because microgravity flames survive at lower O2, **you need more suppressant than Earth standards assume**. BASS found that spraying an agent locally can backfire: the jet pulls in fresh air and can *strengthen* the flame. Turning off the ventilation is part of the ISS fire response, but Saffire showed it can't be relied on to put a fire out fast. The ISS now uses **fine water mist** portable extinguishers, informed by the 2003 Mist experiment, which began replacing CO2 units in December 2015.

**16. Partial gravity: the Moon and Mars.** The Moon is 1/6 g and Mars about 3/8 g. Their buoyant flows are weak, often in the same speed range as spacecraft ventilation, so some materials may burn at *lower* O2 there than on Earth or in orbit. **PSI has no partial-gravity data yet.** The upcoming sources are FM2, the first combustion experiment on another world, and LUCI, while FLARE works to connect ground limits to microgravity limits. For now, microgravity and 1-g results **bound** the answer. ACME E-FIELD imitated buoyancy using the electric force on ions in the flame, with up to 10 kV applied.

## A-Z quick reference

| Term | In one line |
| --- | --- |
| Buoyancy | Hot gas rising because it's lighter. It's absent in microgravity |
| Concurrent spread | A flame moving with the airflow. Fast, and reaches a limiting length in microgravity |
| Cool flame | An almost invisible flame at about 600 to 1,000 K using low-temperature chemistry |
| d-squared law | A droplet's diameter squared falls at a steady rate as it burns |
| Deflagration | A fast flame through a premixed vapour cloud |
| Diffusion flame | Fuel and oxygen meet at the flame. Nearly every real fire |
| Diluent | An inert gas (N2, CO2, He) that absorbs heat and thins the oxygen |
| Extinction | The flame goes out, by radiation, diffusion or blow-off |
| Flammability limit | The boundary of conditions where a flame can survive |
| Inverse flame | Oxidizer flows into fuel: an "inside-out" flame |
| Lewis number | Heat diffusion compared to mass diffusion. High values cause pulsating flames (s-Flame) |
| Liftoff | A flame detaching from its burner (SLICE) |
| LOI | Limiting oxygen index, the lowest O2 that sustains burning |
| Microgravity | Free fall. On the ISS, near-zero effective gravity |
| NASA-STD-6001 | NASA's materials flammability test standard. Test 1 burns samples upward in 1 g |
| Opposed spread | A flame creeping against the airflow |
| Partial pressure of O2 | O2 fraction times total pressure. What you breathe |
| PMMA | Acrylic plastic, the standard test solid |
| Pyrolysis | A solid breaking down into vapour when heated. The fuel a solid fire really burns |
| Radiative extinction | A flame losing heat by radiation faster than it makes heat |
| SIBAL | A 75% cotton, 25% fiberglass fabric used as a standard Saffire sample |
| Smoke point | The largest flame that still burns without emitting soot |
| Soot | Solid carbon particles. They make flames yellow and smoke dark |
| Stoichiometric | The exact fuel-to-oxygen ratio for complete burning |
| Stretch | How strongly the flow pulls a flame apart. Low stretch lets radiation dominate |

## The investigations

PSI lists **19 combustion investigations, all complete** ([PSI list](https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/)). The table below groups them by how directly they bear on fire safety, which is the order your default ranking should follow. Investigations marked (not in PSI) are named in the challenge but weren't in the PSI list I could read, so check them on the live site.

| Investigation | Tier | Pillar | Fuel and setup | Hardware | What it found, or why it matters |
| --- | --- | --- | --- | --- | --- |
| BASS, BASS-II | Direct | Prevention, suppression | Solids: flat fabric and plastic, PMMA spheres, wax, candles. Flow speed and N2 dilution varied, 17 to 21% O2 at 1 atm | MSG plus SPICE duct | Materials burn below Earth O2 limits. NASA-STD-6001 may not be conservative. Local suppressant jets can feed the flame |
| Saffire I, II, III | Direct | Prevention, detection | Large fabric and plastic samples burned inside empty Cygnus cargo ships after leaving the ISS, so a big fire posed no risk to crew *(background)* | Saffire module in Cygnus | Thin flames reach a limiting size. Flame-spread data at realistic scale. Later Saffire IV and V went to about 26% O2 and about 10.4 psi |
| SAME, SAME-R | Direct | Detection | Teflon, Kapton, silicone, cellulose, cotton, Pyrell and dibutyl phthalate heated to smoke | MSG | Smoke is mostly sub-micron. ISS detectors need a wider size range |
| FLEX, FLEX-2 | Direct | Suppression | Heptane, methanol and later fuel mixtures as 1 to 5 mm droplets, in O2/N2 diluted with CO2, He, N2 or Xe | CIR plus MDCA | LOI is lower in microgravity, so more suppressant is needed. Discovered cool flames |
| ACME BRE | Close | Prevention | A flat porous burner feeds gas at a rate that mimics paper, plastic and alcohol burning | CIR plus ACME | Materials can burn for minutes in still air. Tests whether ground flammability tests transfer to low gravity |
| DAFT, DAFT-2 | Close | Detection | Measures ISS background dust with a modified P-Trak | Cabin | Dust baseline for avoiding false alarms. Same instrument as SAME |
| SAME modelling study | Close | Detection | Ground-based modelling using SAME data | Ground | A model of smoke generation in microgravity |
| CFI | Foundational | Chemistry | Droplet cool flames | CIR plus MDCA | Low-temperature chemistry, invisible burning |
| Counterflow cool flame study | Foundational | Chemistry | Counterflow flames near radiation and stretch extinction | Ground or ISS (check PSI) | Quantifies cool-flame transitions |
| ACME s-Flame | Foundational | Modelling | Spherical diffusion flames from a porous sphere, using H2, methane and ethylene | CIR plus ACME | Growth and extinction data for validating models |
| ACME E-FIELD Flames | Foundational | Partial-gravity proxy | Coflow flames with up to 10 kV applied between burner and mesh | CIR plus ACME | Ion forces mimic buoyancy. Possibly lower emissions |
| SPICE | Foundational | Detection, modelling | Gas-jet flames, measuring the smoke point | MSG | Data on how sooty flames get. Built the flow duct BASS reused |
| SLICE | Foundational | Modelling | Lifted gas-jet flames | MSG plus SPICE duct | How and when flames detach from burners |
| ACME CFI-G (not in PSI) | Foundational, but the highest O2 | Chemistry, high O2 | Inside-out flames, with up to 85% O2 flowing into a chamber of propane or butane in N2 | CIR plus ACME | **The highest-oxygen microgravity tests**, the closest data to oxygen-rich habitats |
| ACME CLD Flame (not in PSI) | Foundational | Modelling | Diluted methane and ethylene coflow flames | CIR plus ACME | Benchmark soot and chemistry data |
| ACME Flame Design (not in PSI) | Foundational | High O2, soot | O2-enriched normal and inverse ethylene and methane flames | CIR plus ACME | First quasi-steady spherical flames. Radiative extinction of large flames |

**Coming next, not in PSI yet:** SoFIE (solids in the CIR at 10 to 40% O2, 0.2 to 1.5 atm, 0 to 30 cm/s), FLARE (linking ground and microgravity limits), FM2 (burning on the Moon) and LUCI (lunar gravity). Show these in a "coming soon" strip. It tells judges you understand the roadmap.

## The hardware

| Facility | What it is | Key specs | Investigations |
| --- | --- | --- | --- |
| **CIR**, Combustion Integrated Rack | The ISS's only dedicated combustion rack, in the US Destiny lab | 100-litre chamber, 8 windows, cameras, gas supply and cleanup. Launched on STS-126 in Nov 2008 | ACME (6 experiments), FLEX, FLEX-2, CFI, and SoFIE next |
| **MDCA**, Multi-user Droplet Combustion Apparatus | A droplet insert that fits inside the CIR | 1 to 5 mm droplets, free or on a fibre, 0 to 3 atm, up to 40% O2 | FLEX, FLEX-2, CFI |
| **ACME** module | A modular gas-flame insert for the CIR | Swappable burners: porous flat, sphere and coflow. Over 1,500 flames from 2017 to 2022 | BRE, CLD, CFI-G, E-FIELD, Flame Design, s-Flame |
| **MSG**, Microgravity Science Glovebox | A sealed work box kept below cabin pressure | 255 litres, 1,000 W of power and cooling, running since 2002 | SPICE, SLICE, BASS, BASS-II, SAME, SAME-R |
| **SPICE duct** | A fan-driven flow tunnel used inside the MSG | Controls airflow past the flame | SPICE, SLICE, BASS, BASS-II |

Sources: [Researcher's Guide](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf), [Glenn](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/), [Universe Today](https://www.universetoday.com/156351/fire-acts-strangely-in-microgravity-astronauts-have-lit-more-than-1500-fires-on-the-space-station-to-figure-out-why).

## The historical fires

Each one teaches one lesson. Put this as a timeline in the app, with each event linked to the investigations that address its cause.

| Date | Event | What happened | The lesson | Linked research |
| --- | --- | --- | --- | --- |
| 2026, Artemis II | Smoke alarm | A smoke detector tripped on the second-to-last day of the 9-day mission, about 80,000 miles from Earth. The cause hasn't been reported. "It wasn't scary, but it was tense" ([Aerospace America](https://aerospaceamerica.aiaa.org/artemis-ii-astronauts-praise-orion-capsule-reflect-on-mission-impact/)) | False alarms or real ones, detection must be trusted | SAME, DAFT |
| 24 Feb 1997 | Mir fire | A solid-fuel oxygen generator candle, probably contaminated by latex glove material, threw out a 3-foot flame with sparks and molten metal. It burned for several minutes, blocked one Soyuz escape vehicle, and took three foam extinguishers. The smoke took hours to clear ([NASA](https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/)) | Oxygen sources are ignition sources. Smoke is the bigger danger | FLEX, SAME, Saffire |
| April 1970 | Apollo 13 | A heater rated for 28 V was left on at 65 V. It reached about 1,000 °F, damaged the Teflon insulation, and oxygen tank 2 exploded on day 3 ([NASA SMA](https://sma.nasa.gov/sma-disciplines/accllp/apollo-13)) | Overheated insulation in pure O2 is a bomb. Design for the worst case | SAME (overheat smoke), BASS |
| 27 Jan 1967 | Apollo 1 | A fire in a 100% O2 cabin during a ground test, probably from arcing wires, killed 3 crew. They died of CO and toxic gas, not burns. The hatch needed 90 seconds to open ([NASA SMA](https://sma.nasa.gov/sma-disciplines/accllp/apollo-1)) | Oxygen concentration and material choice decide everything | BASS, Saffire, CFI-G |

## Earth spinoffs (the "Earth benefits" panel)

| Spinoff | Space origin | Earth benefit | Link |
| --- | --- | --- | --- |
| Fine water mist extinguishers | ISS portable fire extinguishers, informed by the Mist experiment | Less water, less damage, non-toxic | [Researcher's Guide](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf) |
| Firefighter air tanks | Johnson Space Center lightweight tanks | 20 lb for 30 minutes of air, 13 lb lighter, 4,500 psi | [Spinoff 9582](https://spinoff.nasa.gov/node/9582) |
| Incipient fire detector | The space shuttle's fire detector | Detects combustion particles before smoke or flame, and tells them apart from dust. Used in mines | [Spinoff 9407](https://spinoff.nasa.gov/node/9407) |
| Project FIRES protective gear | Spacesuit and heat-shield materials | Lighter, fire-resistant firefighter clothing, field-tested by 14 fire departments | [Spinoff 9918](https://spinoff.nasa.gov/node/9918) |
| Smarter smoke detectors | A NASA detector sensing particles and gases together | Fewer false alarms than aircraft smoke detectors in FAA tests | [Researcher's Guide](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf) |

## The question you should be asking

You asked "how do we build an SI dashboard?". That's the wrong question. Every team will build one.

**The right question is: "What will a NASA fire safety engineer learn from Redshift in 30 seconds that they couldn't learn from PSI in a day?"** If the answer is "which experiments matter for a 30% O2 lunar base, what they found, and the exact gap nobody has tested yet", you have a winner. Write that sentence on the wall in hour 0, and cut every feature that doesn't serve it.

Next step: approve this plan, or tell me what to change, and I'll draft the repo layout, the JSON schema and the extraction prompt. I won't write any code until you say go.

## Sources

Opened and read:

- [NASA PSI combustion investigations list](https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/)
- [PSI database guide (PDF)](https://science.nasa.gov/wp-content/uploads/2024/11/psi-database-guide.pdf)
- [Glenn Combustion Science](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/)
- [A Researcher's Guide to Combustion Science (landing page)](https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/) and [the full PDF](https://www.nasa.gov/sites/default/files/atoms/files/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf)
- [Apollo 1, NASA SMA](https://sma.nasa.gov/sma-disciplines/accllp/apollo-1)
- [Apollo 13, NASA SMA](https://sma.nasa.gov/sma-disciplines/accllp/apollo-13)
- [Mir fire, NASA History](https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/)
- [Spinoff: firefighter air tanks](https://spinoff.nasa.gov/node/9582), [Spinoff: fire detector](https://spinoff.nasa.gov/node/9407), [Spinoff: fire attire](https://spinoff.nasa.gov/node/9918)
- [ACME mission page](https://science.nasa.gov/mission/acme) and [Universe Today on ACME's 1,500 fires](https://www.universetoday.com/156351/fire-acts-strangely-in-microgravity-astronauts-have-lit-more-than-1500-fires-on-the-space-station-to-figure-out-why)
- [Saffire IV and V results, ICES 2021](https://ntrs.nasa.gov/api/citations/20210011521/downloads/ICES%202021-266%200503-2021%20final.pdf)
- [SAME summary (PDF)](https://www.nasa.gov/wp-content/uploads/2025/07/smoke-aerosol-measurement-experiment-same.pdf)
- [UMD on CFI-G cool flames](https://fpe.umd.edu/release/unusual-flames-discovered-aboard-the-international-space-station)
- [UC San Diego on FLEX](https://today.ucsd.edu/story/how_do_you_fight_fire_in_space_experiments_provide_some_answers)
- [Aerospace America on the Artemis II smoke alarm](https://aerospaceamerica.aiaa.org/artemis-ii-astronauts-praise-orion-capsule-reflect-on-mission-impact/)
- [Space Apps judging and awards guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) and [project submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)

Could not read: the [PSI search page](https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation) (JavaScript app, and blocked from our server) and the [YouTube ScienceCast](https://www.youtube.com/watch?v=W1oXykoz9zg) (title and description only).

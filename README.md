# Jovian Wake — Prototype 0.4

A small TypeScript browser deckbuilder about carrying thirty people toward Jupiter. Humanity has discovered life on Europa; your one-way expedition is preparing a foothold on Callisto.

This version tests whether the cruise deck you build creates interesting choices during a short Callisto commissioning phase. The cruise remains playable on its own; at arrival, you can continue into an optional six-week colony trial. Expedition preparation is not implemented.

Cards represent trained routines and equipment prepared from what is already aboard. Buying a card does not mean resupply from Earth. The prototype abstracts material limits; acquisitions have no supply caps.

## Engineering experiment

The `codex/engineering-experiment` branch also contains a separate eight-watch experiment in coupled power, cooling, life support, and diagnosis. Open `?mode=engineering` on the local game, or choose **Try the engineering experiment** in the cruise briefing. The cruise and six-week colony trial remain the comparison baseline.

Operate the same utility package through four cruise watches and four Callisto commissioning watches. Internal wear can be inspected; maintenance records, spares, crew assignments, operating choices, and downstream consequences persist across arrival. Four fixed starting cases and an optional full-information view support comparison. The final debrief reveals actual causes and includes a copyable/downloadable JSON run record. Reloading starts over.

This tests whether causal equipment history and diagnosis create interesting strategy. It is not yet a colony society simulation or a physical spacecraft model. See [the experiment rules and playtest plan](docs/engineering-experiment.md).

## Play locally

Requires Node.js 24 or later and npm. No account, API key, or backend is needed.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, normally [localhost:5173](http://127.0.0.1:5173/). The voyage lasts **24 monthly turns**. This is a compressed gameplay timescale, not a trajectory calculation.

New voyages generate a random seed. The same seed and choices reproduce a run: enter a seed in the briefing, use a `?seed=CALLISTO-01` link, or choose **Replay this seed** after arrival. Explicit seed links preserve their seed on reload; opening the game without a seed generates a fresh one. Reloading starts over; there is no autosave. Older `months` URL parameters are ignored.

Cards animate when dealt, played, acquired, discarded, or retired, with brief Work-gain feedback and quiet interface sounds. Use **Sound on/off** in the header to mute; that preference is remembered across reloads. Motion follows the device's reduced-motion preference. Feedback observes completed transitions and never delays input or changes seeded gameplay.

```sh
npm test
npm run simulate
npm run build
npm run preview
```

The build checks TypeScript and writes the static game to `dist/`. The game uses plain TypeScript, Vite, HTML, and CSS without a runtime framework or server.

## A month aboard

Start with **7 Crew Shifts and 3 Colony Stores**. Each month starts with a five-card hand, one Ops play, and one Buy. An event can modify the opening hand.

Months repeat **ordinary cruise → event → crisis**:

1. Resolve any opening event choice. Some events add a Burden automatically after the opening draw.
2. Play Ops cards. Each costs an Ops play before applying its effects. Extra Ops lets you chain cards.
3. Play Work cards. Once you leave Ops, you cannot return to it that month.
4. On crisis months, choose a response: **spend Work, consume matching Cargo, or accept Burdens**.
5. Spend the remaining Work and Buys acquiring cards. Acquisitions go to discard, and supplies do not run out.
6. End the month. Discard the hand and played cards. Unspent Work, Ops, and Buys expire.

An exhausted draw pile reshuffles the discard pile. Discarding preserves a card for later; **retirement removes it permanently**, including its arrival value.

## Cards and Cargo families

- **Work:** Crew Shift generates 1 Work; Specialist Shift costs 3 and generates 2; Expert Shift costs 6 and generates 3.
- **Ops:** draws, extra plays, deck cleanup, upgrades, and extra acquisitions.
- **Cargo:** occupies a hand slot with no normal play effect. Scores at arrival or can be consumed for a matching crisis response.
- **Burden:** cannot be played, clogs draws, and subtracts **1 arrival point per unresolved card**. Retirement removes both costs.

| Cargo | Family | Cost | Arrival points | Voyage use |
| --- | --- | ---: | ---: | --- |
| Colony Stores | Habitat | 2 | 1 | Outfit a medical isolation area |
| Habitation Modules | Habitat | 5 | 3 | Outfit a medical isolation area |
| Industrial Core | Industry | 5 | 3 | Cannibalize repair or power-system components |
| Europa Instruments | Science | 5 | 3 | Dedicate reference instruments to dosimetry |

A crisis consumes **one matching card**, permanently retiring it. It may come from anywhere you own it, so its availability does not depend on this month's draw. Choose the card type; the engine uses a copy in hand first, then discard, then the draw pile. It costs no Work, Buy, or Ops play. The card and its points are lost. Normal retirement effects still operate only on the cards specified in their text.

The three specialized kits have equal prices and points to make their uses the main distinction. The arrival manifest records preserved kits, those consumed in crises, and all retired Cargo by family. Preserved Cargo enables colony actions in the optional trial.

| Ops | Cost | Effect |
| --- | ---: | --- |
| Streamlining | 2 | Retire up to 4 hand cards |
| Crew Sync | 3 | Draw 1; +2 Ops plays |
| Integrated Diagnostics | 4 | Draw 3 |
| Salvage | 4 | +1 Work; optionally retire 1 hand card, gaining +2 more Work if it is Cargo |
| Cross-Training | 5 | Draw 2; +1 Ops play |
| Parallel Programs | 5 | Draw 1; +1 Ops play; +1 Work; +1 Buy |
| Rapid Prototyping | 3 | Gain an Ops card costing up to 4 into discard |
| Load Balancing | 2 | +1 Ops play; discard any number of hand cards and draw that many |
| Systems Integration | 4 | Retire 1 hand card; gain a card costing up to its cost +2 |
| Predictive Maintenance | 5 | Draw 1; +1 Ops play; inspect top 2, then retire, discard, or reorder them |

Gains use no Work or Buy. Earth Political Shock restricts both purchases and free Ops gains that month.

## Crises, wear, and arrival

All crises use normal five-card hands. Respond **after playing Work, before buying**. Spending Work on a crisis reduces purchasing power immediately. There is no generated-Work threshold or bonus for passing a check.

| Month | Crisis | Spend Work | Or consume | Or take |
| --- | --- | ---: | --- | --- |
| 3 | Coolant Leak | 4 | 1 Industry Cargo | 2 Repair Backlogs |
| 6 | Medical Isolation | 4 | 1 Habitat Cargo | 2 Medical Follow-Ups |
| 9 | Dosimeter Drift | 5 | 1 Science Cargo | 2 Exposure Monitoring |
| 12 | Power Bus Redundancy | 6 | 1 Industry Cargo | 2 Fatigue |

The 24-month voyage repeats the sequence at months 15, 18, 21, and 24. Each crisis gets exactly one response, with deferral always available even if the deck is empty.

Seven events are drawn from a seeded, shuffled queue: Sensor Drift, Earth Political Shock, Solar Particle Event, Micrometeoroid Strike, Cabin Fever, Bearing Wear, and Interrupted Sleep. The last two add a Burden automatically. New Burdens enter discard and can be drawn after a reshuffle, including later in the same month. The event queue reshuffles when exhausted.

```text
Arrival score = printed points on owned Cargo − number of owned Burdens
```

Every owned zone counts, including temporarily inspected cards. Retired cards do not count. The Burden penalty keeps final-month deferral consequential. The summary also records the exact crisis responses, Work spent, Cargo preserved and used, and unresolved obligations.

Arrival opens the **Mission Debrief**, an expedition report with the score, preserved and consumed Cargo by family, lost Cargo points, named unresolved Burdens, and a dated record of crisis choices. Cargo retired through Ops is shown separately from Cargo consumed in crises. The report reads existing run state and does not change scoring or simulation rules.

After the optional Callisto trial, the same report includes settlement viability, commissioned systems, remaining reserves and issues, and the opening Europa campaign's observations. You can return to the report during commissioning and resume the trial without losing progress. A retry replaces the current trial record; reloading still resets the run.

## Six weeks on Callisto

From the arrival manifest, choose **Begin Callisto trial**. Each week gives two crew assignments and three power units. Commission Shelter and Recycler twice each; Habitat and Industry Cargo each save a crew assignment on their matching project. Science Cargo enables one Europa observation in each of weeks 3–6. Issues appear on a fixed schedule, and resolving one costs a crew assignment and one power.

At week's end, unfinished essential systems cost one ship-support reserve; each issue from an earlier week costs one more until resolved. New issues have a week of grace. The trial ends early if reserves reach zero. At the end of week 6, a viable settlement needs both systems complete, at least one reserve, and no more than two open issues. Four observations complete the opening Europa campaign; partial science and a viable settlement can coexist.

Starting reserves are five, plus one per five preserved Cargo kits (capped at two extra), minus one per three unresolved Burdens (capped at two); the minimum is three. Any Burden also starts one Crew strain issue. Cargo beyond the first kit of a family currently affects only the capped reserve calculation; the value of surplus kits is an open design question. The six-week sequence is deliberately scripted for comparison, not a full colony simulation or a tested balance model. You can retry it from the same arrival manifest.

## Structure and verification

```text
src/
  entry.ts      Selects the cruise baseline or engineering experiment
  types.ts      Cards, encounters, choices, and state
  content.ts    Card and encounter data
  engine.ts     Pure transitions and seeded shuffling
  colony.ts     Pure six-week colony trial and cruise handoff
  engineering.ts       Pure coupled utilities, crew actions, and diagnosis
  engineering-view.ts  Engineering briefing, controls, telemetry, and debrief
  engineering.css      Responsive experiment layout
  main.ts       Browser rendering and input
  feedback.ts   Card movement and resource feedback from state changes
  sound.ts      Synthesized interface sounds and remembered mute preference
  style.css     Dark space theme and responsive layout
  debrief.ts    Read-only voyage and commissioning report
  debrief.css   Responsive expedition report layout
tests/
  engine.test.ts
  colony.test.ts
  debrief.test.ts
  engineering.test.ts
scripts/
  simulate.mjs  Repeatable full-voyage smoke playtests
```

State is one plain object. Cards have unique identities and occupy one zone each. The engine owns rules and randomness; rendering consumes no randomness. New crises use the existing Work/Cargo/Burden data fields.

Tests protect phase order, crisis payments, Cargo families and retirement, scoring, immutable transitions, card effects, deterministic replay, and arrival at 12 and 24 months. `npm run simulate` runs 200 seeds for each of two builds and three response preferences over the standard 24-month voyage: 1,200 voyages. Pass a smaller or larger count with `npm run simulate -- 50`.

The colony tests protect manifest conversion, weekly budgets, issue aging, the Europa observation limit, and a viable six-week route. Voyage simulations still stop at arrival; colony balance needs human playtests.

Simulated strategies are deliberately simple. They check progress, accounting, and repeatability; their scores are **not human difficulty estimates**. Balance still needs playtesting. A 10–20 minute run is a target, not a measured guarantee.

Useful playtest questions:

- Did you choose between spending Work, sacrificing Cargo, and accepting a Burden?
- Did Cargo's family change what you bought or preserved?
- Did cleanup make problems trivial, or did Burdens overwhelm weak draws?
- Did the second half of the voyage produce new decisions or merely more of the same?

## Public hosting

`npm run build:pages` builds for the `/jovian-wake/` path. The GitHub Pages workflow installs dependencies, runs tests and short simulated voyages, builds, and deploys pushes to `deckbuilding-prototype`.

The repository's Pages source must be **GitHub Actions**. The intended address is [kileader.github.io/jovian-wake](https://kileader.github.io/jovian-wake/). This is a static public playtest with no accounts, server, or saved runs. The deployment follows [Vite's GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages).

## Earlier prototypes

The original project-and-event version is preserved at [v0.1.0](https://github.com/kileader/jovian-wake/tree/v0.1.0). The last threshold-based crisis version is [commit 6566eb6](https://github.com/kileader/jovian-wake/tree/6566eb6), so both remain available for comparison.

# Jovian Wake — Prototype 0.5

A small TypeScript browser deckbuilder about carrying thirty people toward Jupiter. Humanity has discovered life on Europa; your one-way expedition is preparing a foothold on Callisto.

Build a deck over **24 monthly cruise turns**, then use that same deck for **four turns of Jovian Arrival**. Trajectory, Ship, and Surface progress determine the ending; industry, science, crew obligations, and Cargo losses make the result more specific. Expedition preparation (Phase 1) is not implemented. The purchase pool is deliberately broad for this first strategy playtest.

Cards represent trained routines and equipment prepared from what is already aboard. Buying a card does not mean resupply from Earth. The prototype abstracts material limits; acquisitions have no supply caps. Arrival closes all purchases and gains.

## Play locally

Requires Node.js 24 or later and npm. No account, API key, or backend is needed.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, normally [localhost:5173](http://127.0.0.1:5173/). New voyages generate a seed. Enter one in the briefing, open `?seed=CALLISTO-01`, or choose **Replay this seed** after the ending. The same seed and choices reproduce a run. Reloading starts over; there is no autosave. Older `months` URL parameters are ignored.

The game uses plain TypeScript, Vite, HTML, and CSS. The compact card table shows Ops beside the hand and Work beside purchases or Arrival objectives. Click a supply card or deck inventory name to inspect its rules. On small screens, **Hand / Supply / Deck** becomes **Hand / Arrival / Deck** during Arrival. Entering purchases or Arrival allocation opens that pane; a new turn or card choice returns to Hand.

Cards animate when dealt, played, acquired, discarded, or retired. Brief action feedback occupies the hint beside the play controls. **Sound on/off** remembers the mute preference across reloads; motion respects reduced-motion settings. Feedback never changes seeded gameplay or delays input.

Application startup plays the silent Phicid Productions splash before the briefing. A fresh key, mouse click, or gamepad button skips it; game resets do not replay it. See [splash reuse notes](studio/README-web.md).

```sh
npm test
npm run simulate
npm run build
npm run preview
```

The build checks TypeScript and writes the static game to `dist/`.

## A month aboard

Start with **7 Crew Shifts and 3 Colony Stores**. Each month gives a five-card hand, one Ops play, and one Buy. Events can modify the opening hand.

1. Resolve any opening event choice. Some events add a Burden automatically after drawing.
2. Play Ops. Each spends one Ops before applying its effects. Extra Ops lets you chain cards.
3. Play Work. You cannot return to Ops this turn.
4. Respond to an open crisis: spend Work, consume matching Cargo, accept Burdens, or hold it open for the second hand.
5. Acquire cards using remaining Work and Buys. Gained cards go to discard.
6. End the month. Hand and played cards go to discard; unused resources expire.

Months retain the **cruise → event → crisis** cadence. Each third month opens a response window through the following month. Waiting adds no Burdens yet and gives another hand, but **Work does not accumulate between months**. A response is required at the deadline. The final crisis opens and closes in Month 24, so Arrival always begins with cruise obligations settled.

When the draw pile empties, shuffle discard. Played cards cannot be drawn or retrieved until cleanup. **Retirement removes a card permanently**, including its arrival capability and secondary points.

## Open card pool

The pool contains **14 Ops, 6 Work, and 4 Cargo**. Systems Integration is unavailable; its legacy rule remains in the engine for archived fixtures. Rapid Prototyping stays available for this pass. Load Balancing and Streamlining remain.

| New card | Type | Cost | Rule |
| --- | --- | ---: | --- |
| Crew Reassignment | Ops | 4 | +1 Ops. Optionally retire a Crew Shift from hand; if you do, draw 2. |
| Watch Coordination | Ops | 4 | +2 Ops. Optionally discard one Cargo or Burden from hand to draw 2. |
| Archive Access | Ops | 4 | +1 Ops. Retrieve up to one card from discard to hand. |
| Cargo Reallocation | Ops | 4 | +1 Ops. Discard up to two Cargo; retrieve up to that many Work or Ops from discard. |
| Logistics Network | Ops | 5 | +1 Ops. Retrieve one card per ten owned cards, rounded down, maximum three. |
| Batch Preparation | Work | 4 | +2 Work, +1 Buy. |
| Equipment Drills | Work | 4 | +2 Work, plus 1 if Cargo remains in hand. |
| Contingency Shift | Work | 4 | +2 Work, plus 1 per Burden in hand, maximum bonus 2. |

Logistics Network counts every owned card, including Burdens and deployed Cargo; retired cards do not count. Retrieval neither gains new cards nor spends a Buy. Conditional Work cards leave Cargo and Burdens in hand. Crew Shift, Specialist Shift, and Expert Shift still supply simple unconditional Work.

## Cargo and the Habitat crisis

Cargo occupies a cruise hand slot and can resolve a matching crisis from any owned pile. During Arrival it must reach the hand, through a draw or retrieval, before use.

| Cargo | Family | Cost | Secondary points | Arrival deployment |
| --- | --- | ---: | ---: | --- |
| Colony Stores | Habitat | 2 | 1 | +2 Surface |
| Habitation Modules | Habitat | 5 | 3 | +4 Surface |
| Industrial Core | Industry | 5 | 3 | +4 Ship, +1 Surface |
| Europa Instruments | Science | 5 | 3 | +3 Trajectory, +1 Ship |

**Medical Isolation** requires **4 Work**, **one Colony Stores plus 2 Work**, or **one Habitation Modules**. Deferring adds two Medical Follow-Up cards. Colony Stores no longer provide a free response. A Cargo payment permanently retires one kit; insufficient Work cannot partially consume it.

## Four-turn Jovian Arrival

After Month 24 cleanup, choose **Begin Jovian Arrival**. Continue the actual deck/discard cycle without replacing or reshuffling the deck unnecessarily. Each Arrival turn draws five cards and starts with one Ops, no Buys, and no Work. Play Ops and Work as usual, then spend Work on **this turn's stage demand** and on persistent readiness at one progress per Work. These are separate payments. Readiness carries forward; stage payments and unused Work do not.

Base targets are **Trajectory 8, Ship 8, Surface 6**. Ship progress of **4** is the survival minimum. Full Ship readiness is distinct from crew survival: reaching the other targets with a damaged or incompletely prepared ship can produce an emergency foothold.

| Turn | Stage | Fresh Work demand | Supporting deployed Cargo | Missing the demand |
| --- | --- | ---: | --- | --- |
| 1 | Jupiter capture | 4 | Science | +1 ship damage; emergency readiness |
| 2 | Radiation passage | 5 | Industry | +1 ship damage; emergency readiness |
| 3 | Callisto transfer | 4 | Science | +1 ship damage; survivors remain in orbit |
| 4 | Surface activation | 5 | Habitat | Ship-supported refuge if Callisto is reached |

Each matching deployed kit reduces its stage's demand by **1 Work, capped at 2** across all copies. Deploy before paying to receive the reduction. Previously deployed kits continue to support later matching stages, but every stage still needs fresh Work. Stage demand payments do not add readiness progress. All four demands and the three readiness targets are needed for full activation; meeting the targets on turn 1 cannot complete later operations.

Damage raises both the final Ship target and the survival minimum by one per point. Readiness can be prepared on any turn, but a missed transfer or activation prevents that objective's successful ending even when its progress bar is full. These are compressed gameplay demands, not a physical trajectory or radiation model.

Cargo in hand can **deploy once**, preserve its points and capability, add its readiness effect, support matching stage demands, and leave the cycling deck. Alternatively, **cannibalize** it permanently for **3 Work**. Crew Conflict makes deployment cost 1 Work. Preserving equipment enables industrial and Europa science endings; sacrificing an Industrial Core can save the settlement while losing its workshop.

Burdens remain dead draws and subtract one secondary point each. They also have distinct Arrival effects:

| Burden | Arrival pressure |
| --- | --- |
| Fatigue | Absorb the first 1 generated Work per card each turn, maximum 2. Applies to Ops, Work, and cannibalization. Assessed when the turn starts. |
| Repair Backlog | Raise the Ship target by 1 each, maximum +3. |
| Exposure Monitoring | Raise the Trajectory target by 1 each, maximum +3. |
| Crew Conflict | Any copies make each Cargo deployment cost 1 Work; does not stack. |
| Medical Follow-Up | Raise the Surface target by 1 each, maximum +3. |

Retiring obligations reduces their continuing pressure. Current-turn Fatigue remains assessed until paid; other requirements reflect remaining owned Burdens.

Endings distinguish **expedition lost**, **survivors stranded in Jovian orbit**, **ship-supported refuge**, **emergency foothold**, and **settlement activated**. Industry, Europa science, crew problems, and Cargo cannibalization are reported alongside that outcome. Cargo points minus Burdens remain a **secondary tally** and do not decide survival.

Mission Debrief records each stage's Work payment, Cargo support, and success or failure, plus the final expedition deck by Work, Ops, Cargo, and Burden, with copy counts and expandable rules. Deployed Cargo remains in this inventory and is marked as deployed; permanently retired cards are excluded.

The old six-week colony trial is disabled in the normal opening flow. Its source and tests are retained for reference; later colony survival can become a separate game. See [prototype decisions and playtest notes](docs/open-pool-arrival.md).

## Engineering experiment

Open `?mode=engineering` or choose **Try the engineering experiment** in the briefing for the separate eight-watch power, cooling, life-support, and diagnosis experiment. Four cruise and four Callisto commissioning watches share equipment history, spares, crew assignments, and consequences. Four starting cases and an optional full-information view support comparison. The debrief includes a JSON run record. Reloading starts over.

It is separate from the deckbuilder and is not a colony society simulation or physical spacecraft model. See [experiment rules and playtest plan](docs/engineering-experiment.md).

## Structure and verification

The engine owns rules and seeded randomness. Rendering reads state without consuming randomness. Physical cards have unique identities and occupy exactly one zone, including temporary inspection and Arrival deployment.

- `src/content.ts`, `types.ts`, `engine.ts`: cards, encounters, choices, and cruise/Arrival transitions.
- `src/main.ts`, `arrival-view.ts`, `arrival.css`: card table, Arrival controls, and outcome report.
- `src/feedback.ts`, `sound.ts`: feedback from completed transitions.
- `src/entry.ts`, `studio/`: startup and reusable splash.
- `src/engineering*`: independent engineering experiment.
- `src/colony.ts`, `debrief.ts`: retained legacy colony/report rules and reference tests.
- `tests/strategy-arrival.test.ts`: retrieval boundaries, crisis windows, mixed Habitat payments, Arrival deck continuity, pressures, partial outcomes, immutable rendering, and replay.
- `scripts/simulate.mjs`: complete cruise plus Arrival smoke runs for Work, engine, thin, fat, Cargo, and Burden policies.

`npm run simulate` runs 200 seeds for each of six builds and three response preferences: **3,600 complete expeditions**, plus deterministic replays. Use `npm run simulate -- 25` for the shorter CI pass. Policies are intentionally simple; outcomes verify accounting, progress, and repeatability rather than estimate human difficulty or enjoyment. Balance needs human playtesting.

## Public hosting

`npm run build:pages` builds for `/jovian-wake/`. The GitHub Pages workflow installs dependencies, runs tests and short simulations, builds, and deploys pushes to **main**. Pages source must be **GitHub Actions**. The public playtest is [kileader.github.io/jovian-wake](https://kileader.github.io/jovian-wake/), with no accounts, server, or saved runs.

## Earlier prototypes

The original project-and-event version remains at [v0.1.0](https://github.com/kileader/jovian-wake/tree/v0.1.0). The last threshold-based crisis version is [commit 6566eb6](https://github.com/kileader/jovian-wake/tree/6566eb6).

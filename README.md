# Jovian Wake — Prototype 0.2

A small TypeScript browser game about carrying thirty people toward Jupiter. Humanity has discovered life on Europa; your one-way expedition is preparing for a foothold on Callisto.

This version tests a **Dominion-inspired deckbuilding loop**: can acquiring capabilities, improving the deck, and carrying awkward but valuable cargo make the cruise worth replaying? Compare it with the automatic-project and event-choice loop preserved in [v0.1.0](https://github.com/kileader/jovian-wake/tree/v0.1.0).

The slice ends at arrival. There is no colony gameplay, expedition preparation phase, permanent ship-upgrade system, or set of Ship/Crew/Supplies/Readiness meters. Training, fabrication, maintenance, and prepared stores are represented by cards. Acquiring a card means preparing something aboard the ship, not receiving a resupply from Earth.

## Play locally

Requires Node.js 24 or later and npm. No account, API key, or backend is needed.

```sh
npm install
npm run dev
```

Open the address printed by Vite, normally [localhost:5173](http://127.0.0.1:5173/). Choose the default **12-month** voyage or a **24-month** comparison run. These are prototype turn counts, not a trajectory calculation.

The same seed, voyage length, and decisions reproduce a run. Enter a seed in the briefing or use a URL such as [localhost:5173/?seed=callisto&months=24](http://127.0.0.1:5173/?seed=callisto&months=24). The seed does not save progress: reloading starts over, and there is no autosave.

```sh
npm test
npm run build
npm run preview
```

`build` checks TypeScript and writes the static game to `dist/`. `preview` serves that build locally. Tests use Node’s built-in runner and TypeScript stripping, with in-process execution for restricted Windows environments. The game has no runtime framework or server.

## How a month works

The starting deck contains **7 Crew Shifts and 3 Colony Stores**. A normal hand has five cards. Each month begins with one Ops action and one Buy, with any event or crisis changing the situation for that turn.

Months follow a repeating **ordinary cruise → event → crisis** cadence. Event months draw from a seeded, shuffled set of five events: Sensor Drift, Earth Political Shock, Solar Particle Event, Micrometeoroid Strike, and Cabin Fever. The event set reshuffles when exhausted.

1. **Resolve the encounter.** An event can demand discards, add a Burden, restrict available Ops piles, or reduce the hand. A crisis sets requirements for this month.
2. **Play Ops.** Each Ops card spends one Ops action. Cards can draw, grant more actions, improve the deck, or prepare additional Work and Buys. Choosing the order matters.
3. **Play Work.** Work cards generate the effort available for acquisition. Once you leave the Ops phase, you cannot return to it that month.
4. **Acquire cards.** Spend Work and Buys on available supply piles. A card effect that says “gain” uses its own limit instead of spending a Buy. Acquired cards go to the discard pile.
5. **Resolve and clean up.** Assess the crisis, discard the remaining hand and played cards, and advance to the next month. Unspent Work, Ops, and Buys do not carry over.

When a draw exhausts the deck, the discard pile is shuffled into a new deck. Discarded cards can return; **retired cards leave the deck permanently**. Newly acquired cards usually help a later turn, once the deck reaches them.

## The four card types

| Type | Purpose |
| --- | --- |
| **Work** | Crew Shift, Specialist Shift, and Expert Shift produce 1, 2, and 3 Work respectively. |
| **Ops** | Procedures that draw cards, grant actions, generate effort, or change the deck. |
| **Cargo** | Three tiers of prepared stores and equipment score their printed points at arrival. They have no play effect and occupy hand space. |
| **Burden** | Fatigue, Repair Backlog, Exposure Monitoring, Crew Conflict, and Medical Follow-Up have no play effect or points. They enter through consequences and cannot be bought. |

The Cargo piles offer more points per card as the deck becomes capable of more expensive acquisitions:

| Cargo card | Cost in Work | Arrival points | Supply |
| --- | ---: | ---: | ---: |
| Colony Stores | 2 | 1 | 12 |
| Habitation Modules | 5 | 3 | 8 |
| Industrial Core | 8 | 6 | 8 |

All three represent materials and equipment already aboard, tested and prepared for Callisto. The starting deck still contains only Colony Stores as Cargo. Retiring a Cargo card gives up all of its printed arrival points.

The ten Ops cards form the entire initial capability pool:

| Ops card | Cost | Effect |
| --- | ---: | --- |
| Streamlining | 2 | Retire up to 4 cards from your hand. |
| Crew Sync | 3 | Draw 1; gain 2 Ops. |
| Integrated Diagnostics | 4 | Draw 3. |
| Salvage | 4 | Gain 1 Work; optionally retire 1 hand card. Retiring Cargo gives 2 additional Work. |
| Cross-Training | 5 | Draw 2; gain 1 Ops. |
| Parallel Programs | 5 | Draw 1; gain 1 Ops, 1 Work, and 1 Buy. |
| Rapid Prototyping | 3 | Gain an Ops card costing up to 4. |
| Load Balancing | 2 | Gain 1 Ops; discard any number of hand cards and draw that many. |
| Systems Integration | 4 | Retire 1 hand card; gain a card costing up to 2 more. |
| Predictive Maintenance | 5 | Draw 1; gain 1 Ops; inspect the top 2 cards, retiring, discarding, or returning each in your chosen order. |

Costs are measured in Work. Each Ops pile starts with ten cards. Supplies are finite; the Work and Cargo piles have their own counts. The Earth Political Shock event restricts **all** Ops acquisition, including cards gained through effects, to three selected Ops piles for that month.

## Crises and arrival scoring

A crisis occurs every third month. The first twelve months use this fixed sequence:

| Month | Crisis | Starting hand | Ops cards played | Work generated |
| --- | --- | ---: | ---: | ---: |
| 3 | Coolant Deviation | 5 | 0 | 3 |
| 6 | Power Bus Redundancy | 6 | 0 | 5 |
| 9 | Cooling Loop Failure | 6 | 1 | 4 |
| 12 | Arrival Integration Test | 7 | 1 | 6 |

The 24-month mode repeats the pattern in months 15, 18, 21, and 24. Each scheduled crisis gets **one attempt**. Failure adds one fitting Burden; the failed crisis does not linger or retry in intervening months. The voyage continues.

A crisis checks **total Work generated that month**, including Work from Ops cards, and the number of **Ops cards actually played**. It does not check unspent Work or remaining Ops actions. Spending Work on acquisitions does not undo the Work you generated for the crisis.

At arrival, the score is:

```text
Sum of printed points on Cargo still owned + 3 × successful crises
```

Cargo counts wherever it remains in the deck, hand, discard, or play area: 1 point per Colony Stores, 3 per Habitation Modules, and 6 per Industrial Core. Retired Cargo does not score. Burdens do not directly subtract points; they make useful cards harder to draw. This creates the central tradeoff: carry cargo for the final score, or improve the deck’s ability to work through the voyage.

## Small technical structure

Plain TypeScript, Vite, HTML, and CSS:

```text
src/
  types.ts     Card, encounter, choice, and game-state contracts
  content.ts   Cards, events, crises, and their text
  engine.ts    Seeded shuffling and game transitions
  main.ts      Browser rendering and input
  style.css    Responsive presentation
tests/
  engine.test.ts
```

State is a plain object containing card instances and their zones, monthly resources, the current phase and encounter, pending choices, supply counts, crisis results, and a log. Each card instance has its own identity so duplicate cards can be selected independently. Rendering does not consume randomness.

Card values and encounter requirements live in `content.ts`. Add an ordinary card using the existing effect fields there; introduce a new special effect in the shared type and engine only when the existing operations cannot express it. Keep the UI responsible for presentation and legal input, with rules in the engine.

## Verification and playtesting

The important rule checks are deterministic replay, legal phase transitions, draw/discard/reshuffle behavior, individual card selection, retirement and gain limits, finite supply, event acquisition restrictions, crisis accounting, cleanup, and final scoring. Run `npm test` for the current automated results. Automated runs can reveal broken rules or deadlocks; they cannot establish that the game is enjoyable.

Balance is provisional. The small pool is meant to make mechanical changes inexpensive, and the two voyage lengths exist to test whether the deck has enough time to develop. A 10–20 minute run remains a playtest target, not a measured guarantee; repeat players may finish much faster, and the 24-month mode may take longer.

Useful questions after a run:

1. Did the deck develop a recognizable identity, or did the same purchases always seem best?
2. When did carrying Cargo create an interesting decision about points versus useful draws?
3. Did a crisis reward preparation, or mostly punish a poor hand?
4. Did twelve months allow enough time to enjoy the deck? Did twenty-four add decisions or repetition?
5. Which loop would you replay: this deckbuilder or v0.1’s projects and event choices?

## Revisit v0.1

The original prototype is preserved at the [`v0.1.0` tag](https://github.com/kileader/jovian-wake/tree/v0.1.0) in the [public repository](https://github.com/kileader/jovian-wake).

To inspect it locally, commit or stash current working changes before switching versions:

```sh
git switch --detach v0.1.0
npm install
npm run dev
```

Use `git switch -` to return to the previous checkout. The tagged version retains its own rules and README for comparison.

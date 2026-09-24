# Jovian Wake — Prototype 0.1

A small browser game about carrying thirty people across twenty-four months of interplanetary space. Humanity has discovered life on Europa; your one-way expedition is bound for a foothold on Callisto.

The question this prototype tests: **can a few long-term commitments and delayed consequences make the cruise worth playing again?** It stops at arrival. Expedition preparation, colony gameplay, surface exploration, and deckbuilding are outside this version.

## Play locally

Requires Node.js 24 or later and npm. No account, API key, or backend is needed.

```sh
npm install
npm run dev
```

Open the local address printed by Vite (normally [localhost:5173](http://127.0.0.1:5173/)). Set a voyage seed in the briefing or open `/?seed=your-seed`. A seed plus the same project and event choices reproduces the voyage. Restart controls can replay a seed or generate another.

```sh
npm test
npm run build
npm run preview
```

`build` checks TypeScript and writes the static game to `dist/`. Tests use Node's built-in runner and TypeScript stripping; they run in-process to support restricted Windows environments. The UI optionally loads Google Fonts and falls back to system fonts when unavailable. Game rules require no network access once the page loads.

## The playable slice

- Four 0–100 conditions: **Ship**, **Crew**, **Supplies**, and **Readiness**. Zero Ship, Crew, or Supplies ends the voyage. Zero Readiness does not.
- One automatic major project: closed-loop agriculture, local fabrication, crew cross-training, radiation mitigation, or Europa research.
- Fourteen authored events: eleven ordinary events and three follow-ups. A fifteenth reusable quiet-month event offers maintenance, recreation, or arrival rehearsal.
- Immediate costs, project-specific options, and consequences that may return several months later.
- A voyage log, clear action costs, failure report, and Month 24 arrival assessment including scientific progress and unfinished work.

Each new month applies routine wear, advances the current project, and presents one decision. A delayed consequence takes priority over a new event. Otherwise the game has a 70% chance to draw an eligible, unseen event; months without one are quiet. Ordinary events do not repeat. Project delays skip future monthly work, rather than deleting work already completed.

Project work needs no monthly confirmation. Start another project between months when the slot opens. Project completion happens before the month's decision; recurring benefits start with the following month's upkeep. The same-month event can use a newly completed project's protection or special option.

Supplies represent usable consumables and spare materials, not a literal percentage of food remaining. The other condition scores are likewise abstractions. Europa science is an arrival outcome, not a fifth spendable resource. A twenty-four-month transfer is an assumed premise; there is no trajectory, propulsion, population, or radiation-dose simulation here.

## Small technical structure

Plain TypeScript, Vite, HTML, and CSS. No runtime framework or server.

```text
src/
  types.ts     State and content types
  content.ts   Project definitions, events, choices, and prose
  engine.ts    Seeded randomness and immutable game transitions
  main.ts      Rendering and browser input
  style.css    Responsive presentation
tests/
  engine.test.ts
```

The state is a plain object: seed and RNG position; month and phase; four condition scores; one active project and completed project IDs; science; narrative flags; queued follow-ups; seen event IDs; current event; and log entries. There are no crew entities, inventories, research trees, or separate simulation services.

The four transitions are `createGame`, `startProject`, `advanceMonth`, and `choose`. Rendering does not consume randomness. Transitions return a fresh state and refuse actions that are invalid in the current phase. The UI only displays costs supplied by the same rules that apply them.

To add an event, add a `VoyageEvent` to `EVENTS` in `src/content.ts`: unique ID, narrative, and choices with effects. Optional month bounds limit eligibility. `requiresProject` unlocks a choice; `followUp` schedules an event with `followUpOnly: true`. Use flags only when a later event needs context. Keep at least one ungated option that costs no supplies so a depleted expedition cannot be left without a decision.

## Verification and playtesting

Engine tests cover seed replay, distinct event routes, legal transitions, immutability, automatic project completion, delays, affordability, project protection, follow-up timing and collisions, nonrepeating events, bounds, failure, and both constructed and natural-resource arrivals. Batch simulations help spot deadlocks and obvious balance problems; they do not measure enjoyment.

The target is a **10–20 minute first run**. That duration and replay appeal need human playtesting. Fast readers and repeat players may finish sooner; no timer pads out the voyage.

For a first playtest, note:

1. Which choice made you stop and think?
2. Did a later consequence make an earlier choice feel meaningful?
3. Did your first project change how you played?
4. When did quiet months feel repetitive?
5. At arrival, did you want to try another project order?

The current event pool is deliberately small. Quiet months become more common as it is exhausted, outcomes are broadly telegraphed, and balance is provisional. Runs do not save across reloads. Change content weights, durations, or rewards before adding another subsystem.

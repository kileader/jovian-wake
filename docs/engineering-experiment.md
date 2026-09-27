# Engineering experiment: what survives the crossing

## Purpose

Test whether operating coupled machinery with incomplete information creates decisions worth revisiting. Compare the experiment with the cruise/colony prototype, and compare hidden condition with full information within the same experiment. A successful engineering trial supports further exploration of persistent equipment and operational knowledge; it does not validate the entire expedition-to-society vision.

The playable boundary is eight operational watches: four in late cruise, four on Callisto. The transportable U-01 utility package operates in both settings. Arrival changes demand and available project work without recreating equipment, stores, people, or records. Transfer operations and elapsed travel time between watches are abstracted.

## Launch

Run `npm run dev`, then open the printed address with `?mode=engineering`. A direct case link can use `?mode=engineering&case=WAKE-01`. Add `&view=full` to start with true condition visible. The cruise briefing also links to the experiment; **Cruise prototype** returns to the baseline.

WAKE-01 through WAKE-04 are fixed, reproducible cases with identical stores and different internal conditions. Their labels deliberately do not identify faults. One starts healthy. The same case and choices produce the same result. No random failure or inspection rolls occur after initialization. Reloading loses the run.

## What the player does

Each watch grants one assignment from Mira Chen, the systems engineer, and one from Alex Okafor, the operations specialist. Both can inspect, service, repair, fabricate, commission, or observe. Mira gets exact inspection results and repairs up to 4 wear; Alex gets a condition band and repairs up to 2. Expertise does not block basic actions.

| Action | Cost | Effect |
| --- | --- | --- |
| Inspect one unit | 1 assignment | Immediate, reliable evidence; no physical change |
| Service one unit | 1 assignment | Remove up to 1 wear; reset service age |
| Repair one unit | 1 assignment, 1 spare | Remove wear according to expertise; reset service age; reduced capacity during testing this watch; inspect the result |
| Fabricate spares | 1 assignment, 2 power, 1 feedstock | Gain 2 spare parts on completion |
| Commission habitat | 1 assignment, 2 power | Add 1 of 2 required progress; available from watch 5 |
| Observe Europa | 1 assignment, 2 power | Gain 1 observation; optional |

Equipment work takes effect immediately. Projects are queued, then resolve when the watch runs. Each project type can be queued once per watch. A project requires all 2 power; if it stalls, it spends the assignment but uses no material and gains no progress. Queue order determines project priority. A queued project can be cancelled before running, returning the assignment. Completed inspections and equipment work cannot be undone.

The live load check previews delivered power, thermal overload, recycling output, and project allocation for the current plan. It is a deliberately generous abstraction of routine telemetry. Inspections expose condition and distance to future degradation thresholds; observations alone may also support useful inferences.

## Coupling and degradation

These are discrete game capacities, not physical units or a thermodynamic simulation.

- Power and cooling each have capacity `max(2, 8 − floor(wear / 2) − repairTestPenalty)`. The repair test penalty is 2 for the current watch.
- Recycler throughput is `max(0, 3 − floor(wear / 3) − repairTestPenalty)`. Its repair test penalty is 1.
- Base loads consume 2 power in cruise and 3 on Callisto. Recycling requests 3 more; each scheduled project requests 2.
- Protected operation supplies the minimum of requested power, generation capacity, and cooling capacity. An override allows up to 2 extra power and bypasses cooling protection.
- Base loads are supplied first. The player then prioritizes recycling or projects. Recycling throughput cannot exceed its allocated power or equipment capacity.
- Crew recycling demand is 2 in cruise and 3 on Callisto. Each unit of shortfall consumes one of the initial 7 reserve supplies. Excess throughput does not replenish stores.
- At each watch's end, service age increases. A unit with age 3 or greater gains 1 wear. Exceeding power or cooling capacity adds another 1 wear to that unit. Wear is capped at 9.
- Initial stores contain 2 spares and 2 feedstock. There is no resupply or unlimited material conversion.

For example, cooling wear can reduce delivered power enough to stall fabrication. That can leave insufficient spares for a later repair. Shifting priority or overriding limits may complete the job at a cost to reserve supplies or future condition. These consequences follow the same rules in both locations.

Records separate **observed information** from **actual condition**. Inspection snapshots retain their original date and value even as wear changes. Full information exposes actual condition without changing the simulation. The debrief reveals the complete causal record and notes whether full information was consulted.

## Outcome and playtest

A viable result requires two habitat commissioning completions, recycling meeting crew demand during the final watch, and at least one reserve remaining. Exhausting reserves ends the trial early. Science, remaining spares, equipment condition, and maintenance obligations are separate results; there is no combined score. Viability is an end-of-trial criterion, not proof of long-term self-sufficiency.

Start with hidden condition. After a complete run, review the actual causes. Replay the same case with different priorities, or compare another case with full information. Use **View run record** to copy or download the JSON history. It is a playtest record, not a loadable save file.

Ask:

1. Did an observation or inspection change a decision?
2. Was a temporary workaround worth its later cost?
3. Can the player explain a late problem through an earlier choice?
4. Did arriving on Callisto make preserved condition or past work matter?
5. Did diagnosis add strategy, or merely consume a compulsory action?
6. Was the repeated service schedule engaging or mechanical?

Compare final supplies, science, spares, and wear alongside these answers. Do not treat completion rates or simulation output as measures of enjoyment. Replaying a known case also introduces learning, so these comparisons are exploratory rather than controlled evidence.

Automated tests demonstrate both a repair route and a workaround route for one case. The repair route finishes with 4 observations, 7 reserves, and 1 spare. The workaround route preserves both spares and gets 6 observations, but finishes with 4 reserves and more cooling wear. These are feasible routes, not claims about optimal play or human difficulty.

## Deliberate boundaries

Three systems, two fixed crew roles, one workshop activity, one commissioning objective. There are no card draws, scripted crisis queues, personality simulation, skill progression, individual physiology, component inventories, or save system in this experiment. The existing deckbuilder and colony trial remain available independently.

The main risks to investigate are an overly regular maintenance schedule, telemetry making inspections unnecessary, and a dominant early-repair strategy. If operating tradeoffs work but diagnosis does not, test the same coupled system with visible condition before adding detail.

## Verification

`npm test` includes the original cruise and colony tests plus engineering tests for evidence precision, immutable transitions, coupling, downstream wear, spare/assignment accounting, repair downtime, persistent arrival state, deterministic viable routes, exhaustion, and alternative strategies. `npm run build` type-checks and builds both modes; `npm run build:pages` checks the deployment base path.

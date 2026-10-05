# Open pool and Arrival first pass

This slice tests whether the deck built over 24 months can deliver a satisfying four-turn ending. It adds five Ops and three Work cards, keeps the purchase pool open, gives crises a second response hand, strengthens the Habitat sacrifice cost, and replaces the normal colony-trial handoff with Arrival. The existing TypeScript engine and presentation remain in use.

## Boundaries

- No Phase 1 selection, supply piles, engine migration, new artwork, or extended colony simulation.
- Systems Integration is unavailable. Rapid Prototyping remains during cruise; all acquisitions stop after Month 24.
- Crew Reassignment complements Streamlining, Predictive Maintenance, and Salvage. It only retires Crew Shift and cannot remove general Burdens.
- Retrieval uses discard only. In-play cards cannot loop through retrieval before cleanup. Cargo Reallocation exchanges hand Cargo for existing Work/Ops, without retiring the kits.
- Logistics Network is the deck-size payoff: ten-card thresholds, capped at three returns. Counting Burdens deliberately overlaps the fat and Burden-tolerant strategies.
- Batch Preparation, Equipment Drills, and Contingency Shift supply Work through Work cards. Watch Coordination supplies the second +2 Ops option.

## Arrival assumptions to test

The readiness targets (8 Trajectory / 8 Ship / 6 Surface), survival floor (4 Ship), fresh demands (4 / 5 / 4 / 5 Work), Cargo effects, and Burden caps are balance hypotheses. They are not validated difficulty settings or physical mission calculations. Readiness accumulates on any turn. Each stage needs its own Work payment, which neither adds readiness nor carries into another turn.

Deployed Science supports capture and transfer, Industry supports radiation passage, and Habitat supports activation. Each matching kit reduces its stage's Work cost by one, capped at two across all copies. Early deployment keeps helping while every stage still needs at least two or three fresh Work. Missing one of the first three stages adds ship damage. Missing any stage blocks full activation; missed capture/radiation limits ship readiness, missed transfer leaves survivors in orbit, and missed activation leaves a ship-supported refuge if Callisto is reached.

Deployment preserves a physical kit and removes it from future draws. Cannibalization permanently retires it for 3 generated Work. All generated Work pays current-turn Fatigue first. Crew Conflict charges deployment, so a hand containing only Cargo and unresolved conflict may need cannibalization to deploy the rest.

Industry and science depend on both preserved equipment and deployment. A viable foothold with an Industrial Core still cycling in the deck reports activation pending. An industrial kit sacrificed for Work reports industrial loss if no copies remain. Crew condition summarizes remaining Fatigue, Crew Conflict, and Medical Follow-Up. Cargo points stay secondary while the outcome design is tested.

## Definition of done for this slice

Complete 24 cruise turns and four Arrival turns using one physical deck. Verify optional and restricted card choices, discard retrieval, two-hand crisis deadlines, atomic mixed Habitat payment, closed Arrival acquisitions, deployment/cannibalization accounting, fresh stage payments, bounded Cargo support, partial endings after missed demands, deterministic replay, and desktop/mobile controls. Keep the normal colony-trial entry disabled. Build the Pages artifact and retain brief rules in the README.

## Human playtest questions

1. Does a mostly Work deck provide a credible baseline without needing an Ops engine?
2. Does the second crisis hand give thinning and long-term engines time to work, while buying still competes with immediate repairs?
3. Is Colony Stores plus 2 Work a meaningful Habitat cost, and are Modules worth preserving for Arrival?
4. Do retrieval and Logistics Network make a large deck feel different rather than merely slower?
5. Can a Burden-tolerant deck accept selected crises profitably? Ignoring every crisis is a separate, much harsher case.
6. Does Load Balancing help find useful Work or Cargo at arrival? Does Crew Reassignment make early thinning less costly?
7. Do the fresh demands keep all four hands meaningful without ending mostly on shuffle luck? Can a strong deck prepare early while still staffing later operations?
8. Does cannibalization create a specific loss worth describing, and do partial endings feel earned?

Record seed, purchase priorities, crisis responses and response month, Arrival progress, deployed/cannibalized kits, and the resulting ending. Compare decisions and hand quality before changing numbers. Automated policies protect accounting and transitions; they cannot tell whether a strategy is enjoyable or optimally played.

After these playtests, decide whether to adjust the pool and Arrival values, then design Phase 1 selection. Do not treat the open pool as a finalized easy mode yet.

## First human playtest finding

Kevin reported that a thin Ops engine followed by multiple copies of each Cargo completed all Arrival objectives on turn 1, leaving the next three turns without meaningful decisions. The final report showed 8 Trajectory, 12 Ship, and 12 Surface, with industrial and Europa science activation and no Arrival cannibalization. This reveals a structural weakness: later checkpoints accept already banked progress, so they impose no new demand on a sufficiently strong first hand.

The next pass replaces cumulative checkpoints with fresh stage Work payments and capped support from deployed Cargo. It preserves early preparation while requiring the deck to produce Work on every turn. A regression test fills readiness on turn 1, then skips later operations: the expedition remains in Jovian orbit. A simple Work-only fixture also reaches full activation. These checks establish the intended behavior; human playtesting still needs to establish difficulty and whether each turn's choices feel worthwhile. Mission Debrief records the four demands alongside the complete remaining deck.

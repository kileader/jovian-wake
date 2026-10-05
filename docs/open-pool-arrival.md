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

The starting targets (8 Trajectory / 8 Ship / 6 Surface), survival floor (4 Ship), checkpoints (2 Trajectory / 3 Ship / 6 Trajectory), Cargo effects, and Burden caps are balance hypotheses. They are not validated difficulty settings or physical mission calculations. Readiness accumulates on any turn; missed stage checkpoints add damage rather than immediately ending the expedition.

Deployment preserves a physical kit and removes it from future draws. Cannibalization permanently retires it for 3 generated Work. All generated Work pays current-turn Fatigue first. Crew Conflict charges deployment, so a hand containing only Cargo and unresolved conflict may need cannibalization to deploy the rest.

Industry and science depend on both preserved equipment and deployment. A viable foothold with an Industrial Core still cycling in the deck reports activation pending. An industrial kit sacrificed for Work reports industrial loss if no copies remain. Crew condition summarizes remaining Fatigue, Crew Conflict, and Medical Follow-Up. Cargo points stay secondary while the outcome design is tested.

## Definition of done for this slice

Complete 24 cruise turns and four Arrival turns using one physical deck. Verify optional and restricted card choices, discard retrieval, two-hand crisis deadlines, atomic mixed Habitat payment, closed Arrival acquisitions, deployment/cannibalization accounting, distinct partial endings, deterministic replay, and desktop/mobile controls. Keep the normal colony-trial entry disabled. Build the Pages artifact and retain brief rules in the README.

## Human playtest questions

1. Does a mostly Work deck provide a credible baseline without needing an Ops engine?
2. Does the second crisis hand give thinning and long-term engines time to work, while buying still competes with immediate repairs?
3. Is Colony Stores plus 2 Work a meaningful Habitat cost, and are Modules worth preserving for Arrival?
4. Do retrieval and Logistics Network make a large deck feel different rather than merely slower?
5. Can a Burden-tolerant deck accept selected crises profitably? Ignoring every crisis is a separate, much harsher case.
6. Does Load Balancing help find useful Work or Cargo at arrival? Does Crew Reassignment make early thinning less costly?
7. Do the four hands expose the deck's strengths without ending mostly on shuffle luck?
8. Does cannibalization create a specific loss worth describing, and do partial endings feel earned?

Record seed, purchase priorities, crisis responses and response month, Arrival progress, deployed/cannibalized kits, and the resulting ending. Compare decisions and hand quality before changing numbers. Automated policies protect accounting and transitions; they cannot tell whether a strategy is enjoyable or optimally played.

After these playtests, decide whether to adjust the pool and Arrival values, then design Phase 1 selection. Do not treat the open pool as a finalized easy mode yet.

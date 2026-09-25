# Phase 3 paper prototype: the first six weeks

**Status: exploratory rules sheet, not an implemented game or a Phase 3 specification.** Test whether a cruise arrival manifest creates different colony decisions. The founding crew is commissioning a Callisto outpost while a planned Europa instrument campaign competes for their time and power. The ship can support them temporarily; these six turns do not claim that a colony becomes fully self-sufficient in six weeks.

## One-page rules sheet

Use six **weeks**. Each week has **two crew-team assignments** and **three power units**. Unused assignments and power expire. Track ship **reserves**, **Shelter** (0–2 progress), **Recycler** (0–2), **Europa data** (0–4), and open **issues**. Each preset below supplies the starting reserves, Cargo, and an issue representing a cruise Burden. Cargo is present for the whole test; one kit of a family enables its action. Extra copies are recorded but have no additional effect yet. Crew procedures in the cruise deck are also omitted for this first test.

At the start of each week, add its scheduled issue. Then take actions in any order within the crew and power budgets:

| Action | Crew teams | Power | Effect |
| --- | ---: | ---: | --- |
| Commission Shelter | 1 with Habitat Cargo; otherwise 2 | 1 | +1 Shelter progress, to a maximum of 2. |
| Commission Recycler | 1 with Industry Cargo; otherwise 2 | 2 | +1 Recycler progress, to a maximum of 2. |
| Resolve an issue | 1 | 1 | Remove one chosen open issue. |
| Europa observation | 1 | 2 | +1 Europa data, at most once in each of weeks 3–6; requires Science Cargo. |

At the **end** of a week, lose one reserve if either Shelter or Recycler has less than two progress. For **each open issue from an earlier week**, lose one more reserve. This repeats weekly until that issue is resolved; an issue first appearing this week has one week of grace. If reserves reach zero, the colony loses its ship-supported margin and this paper run ends. Issues are visible before actions, so the captain can choose which penalty to take.

The week-2 through week-6 issues, in order, are **Airlock seal**, **Recycler contamination**, **Medical follow-up**, **Thermal control**, and **Crew fatigue**. The starting Burden is a **Crew strain** issue added in week 1. These are deliberately fixed for comparison, and the environmental problems are work aboard the outpost rather than recurring cinematic hazards.

At the end of week 6, the settlement is **viable** if Shelter and Recycler are both commissioned, at least one reserve remains, and no more than two issues remain open. Zero open issues is a cleaner result. Four Europa data completes the opening observation campaign; one to three is a partial result. A viable colony with little science, or a valuable campaign with lingering problems, is a valid distinct outcome. There is no single arrival-point threshold.

## Three arrivals against the same six weeks

These are **paper presets**, not a conversion formula from the current game's score. The rich manifest uses the counts from Kevin's successful 24-month run. The two lower-resource manifests are deliberate comparisons. Reserve values are assumed for the exercise and would need a real handoff rule before implementation.

| Arrival | Habitat | Industry | Science | Starting reserves | Starting issue |
| --- | ---: | ---: | ---: | ---: | --- |
| Damaged | 1 | 0 | 1 | 5 | 1 Crew strain |
| Balanced | 2 | 2 | 1 | 5 | 1 Crew strain |
| Rich | 9 | 8 | 7 | 7 | 1 Crew strain |

The notation **H**, **R**, **E**, and **fix** means Shelter progress, Recycler progress, Europa observation, and issue resolution. The entries below are complete action choices, not simulated player behavior.

| Week | Damaged arrival | Balanced arrival | Rich arrival |
| --- | --- | --- | --- |
| 1 | H + fix Crew strain | H + fix Crew strain | H + R; leave Crew strain |
| 2 | H + fix Airlock seal | H + R; leave Airlock seal | H + R; leave Crew strain |
| 3 | R, requiring both teams | R + fix Airlock seal | E + fix Crew strain; Airlock seal becomes overdue |
| 4 | R, requiring both teams; Recycler contamination becomes overdue | E + fix Recycler contamination | E + fix Airlock seal; Recycler contamination becomes overdue |
| 5 | Fix Recycler contamination + Medical follow-up | E + fix Medical follow-up | E + fix Recycler contamination; Medical follow-up becomes overdue |
| 6 | Fix Thermal control + Crew fatigue | E + fix Thermal control; leave new Crew fatigue | E + fix Medical follow-up; leave overdue Thermal control and new Crew fatigue |
| **End** | **1 reserve; viable; 0 data; 0 issues** | **3 reserves; viable; 3 data; 1 issue** | **1 reserve; viable; 4 data; 2 issues** |

### What this paper test says

The three arrivals can all survive, but they ask for different sacrifices. Without Industry, the damaged crew spends entire weeks commissioning the recycler and misses the early Europa campaign. The balanced crew protects more reserves and returns partial data. The rich crew can complete the campaign, but chooses to carry two problems into the next interval and finishes with only one reserve. The same external pressure was used for all three; nothing grew in response to a strong manifest.

**The strongest warning is about excess Cargo.** In this sketch, having one Industry kit changes the work, while having eight instead of two changes nothing. The rich preset's extra reserves are an assumption, not a justified conversion from those kits. A real Phase 3 handoff must give surplus equipment a bounded, credible use (for example spare parts or redundancy) or change how physical Cargo is counted during the cruise. It must not turn every kit into a free problem-canceling token. The current cruise also allows unlimited Cargo preparation, which conflicts with a Phase 1 promise that omitted modules stay omitted.

This is one scripted route per manifest, not evidence of balance or fun. The next design check should ask players to choose the actions themselves, try deliberately science-heavy and survival-heavy routes, and see whether the cost of neglected issues is legible. Only then choose which parts of the cruise deck or Phase 1 commitments become colony capabilities.

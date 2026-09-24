import type { Project, VoyageEvent } from './types.ts';

export const PROJECTS: Project[] = [
  {
    id: 'agriculture', name: 'Closed-loop agriculture', duration: 7,
    description: 'Turn a small crop experiment into a reliable supplement to stored food. Tune water recovery, lighting, and nutrient reuse over several growing cycles.',
    benefit: 'Monthly supplies use falls from 2 to 1. Unlocks a food-system option.',
    completion: { stats: { supplies: 4, readiness: 5 } },
  },
  {
    id: 'fabrication', name: 'Local fabrication', duration: 7,
    description: 'Qualify replacement parts made from the stock aboard ship. The useful work is testing tolerances and teaching people which parts they can safely make.',
    benefit: 'Every ship loss is reduced by 2, including monthly wear. Unlocks repair options.',
    completion: { stats: { ship: 4, readiness: 5 } },
  },
  {
    id: 'training', name: 'Crew cross-training', duration: 6,
    description: 'Give every specialist a practiced backup. Thirty people cannot carry an expert for everything, but they can learn to cover one another.',
    benefit: 'Reduces crew losses from monthly strain and non-radiation events by 2. Does not reduce radiation losses. Unlocks teamwork options.',
    completion: { stats: { crew: 4, readiness: 5 } },
  },
  {
    id: 'radiation', name: 'Radiation mitigation', duration: 5,
    description: 'Repack water and stores around shelter spaces, improve dosimetry, and rehearse shelter routines. Existing mass can protect people better when it is in the right place.',
    benefit: 'Halves crew losses in radiation events, rounded down. Cross-training does not reduce these losses further. Unlocks a shelter option.',
    completion: { stats: { crew: 3, readiness: 8 } },
  },
  {
    id: 'europa', name: 'Europa research', duration: 6,
    description: 'Calibrate the instruments and work through Earth’s evidence for Europan life. Build a sampling plan that separates a discovery from contamination.',
    benefit: 'Adds 1 scientific progress each later month. Unlocks a better research option.',
    completion: { stats: { readiness: 3 }, science: 8 },
  },
];

export const EVENTS: VoyageEvent[] = [
  {
    id: 'recycler', category: 'equipment', title: 'The recycler is running hot',
    minMonth: 2, maxMonth: 18,
    body: 'A bearing in the water recovery loop has started to shed fine metal particles. The water is still safe, but the pump draws more current every week. Chief engineer Imani has found a spare assembly in the departure inventory. Installing it spends something you cannot replace from Earth. A patch might last the voyage; a careful rebuild would need the people currently working on your major project.',
    choices: [
      { id: 'replace', label: 'Fit the spare assembly', description: 'Spend a valuable spare on a permanent repair.', outcome: 'The new assembly runs cool. Imani marks the spare off the inventory and files the old one for salvage.', effect: { stats: { supplies: -9, ship: 3 } } },
      { id: 'patch', label: 'Patch the bearing housing', description: 'Preserve the spare, but risk a larger leak later.', outcome: 'The vibration settles, for now. A yellow maintenance tag stays tied to the housing.', effect: { stats: { ship: -2 }, addFlag: 'recycler_patch', followUp: { eventId: 'recycler_leak', afterMonths: 3, chance: 0.65 } } },
      { id: 'rebuild', label: 'Borrow the project engineers', description: 'Delay project work and stretch the engineers to rebuild it safely.', outcome: 'A long series of careful measurements produces a safe rebuild. Project work waits while the engineers catch up on sleep.', requiresActiveProject: true, effect: { delay: 1, stats: { crew: -3, ship: 2 } } },
      { id: 'fabricate', label: 'Make a qualified replacement', description: 'Use the fabrication workshop to repair it with less stock.', outcome: 'The qualified workshop process earns its keep. A new housing passes inspection before the next shift.', requiresProject: 'fabrication', effect: { stats: { supplies: -3, ship: 4 } } },
    ],
  },
  {
    id: 'dosimeters', category: 'radiation', title: 'The readings do not average out',
    minMonth: 9,
    body: 'The medical officer compares accumulated dosimeter readings and finds a pattern hidden by the shipwide average. People who sleep in one particular bay are receiving more radiation than the planning model predicted. Nobody is acutely ill, but a low daily exposure still adds up across a long voyage. You can rig more shielding from existing stores, move the bunks into a working space, or rotate occupants and accept a higher shared exposure.',
    choices: [
      { id: 'shield', label: 'Rig better shielding around the bay', description: 'Spend fittings to reposition existing mass and learn from the work.', outcome: 'The revised layout improves the readings. The surface team saves the measurements for its own shelter planning.', effect: { stats: { supplies: -6, crew: -2, readiness: 3 } } },
      { id: 'bunks', label: 'Move the affected bunks', description: 'Reduce exposure by converting a sheltered practice bay into sleeping space.', outcome: 'The practice bay gains curtains and sleeping bags. Its old occupants now schedule exercises around somebody else’s bedtime.', effect: { stats: { readiness: -5, crew: -2 } } },
      { id: 'rotate', label: 'Rotate the sleeping assignments', description: 'Preserve supplies and training space while sharing the higher exposure.', outcome: 'The individual readings become more equal. That does not make the accumulated dose disappear.', effect: { stats: { crew: -7 } } },
    ],
  },
  {
    id: 'dental', category: 'medical', title: 'One tooth, thirty schedules',
    minMonth: 4,
    body: 'A systems technician has a cracked molar and has quietly worked around it for weeks. There is no immediate emergency, but eating and sleeping have become difficult. The medical officer can treat it aboard ship. The question is how much margin to spend: the best consumables, time for a conservative staged treatment, or a temporary repair followed by close observation. With a crew this small, one person’s recovery changes everybody’s roster.',
    choices: [
      { id: 'treat', label: 'Use the full treatment kit', description: 'Spend medical consumables on a prompt recovery.', outcome: 'Treatment goes smoothly. The technician eats a full meal and finally admits how much it had hurt.', effect: { stats: { supplies: -6, crew: 3 } } },
      { id: 'rest', label: 'Make room for staged treatment', description: 'Use training shifts to cover a slower recovery.', outcome: 'Recovery takes longer, but there is time to do it carefully. Several arrival exercises move off the calendar.', effect: { stats: { readiness: -5, crew: 2 } } },
      { id: 'temporary', label: 'Use a temporary repair', description: 'Preserve stores and the schedule, accepting longer discomfort and restricted duties.', outcome: 'The temporary repair holds. Extra checkups and restricted duties become part of the routine.', effect: { stats: { crew: -5 } } },
    ],
  },
  {
    id: 'solar', category: 'radiation', title: 'A solar particle warning',
    minMonth: 3, maxMonth: 20,
    body: 'The particle monitor is rising, and delayed reports from the inner system confirm a solar eruption. Your shelter can reduce exposure, but thirty people cannot work normally inside it. Water bags, food containers, and sleeping bodies occupy most of the useful volume. The storm is an interruption rather than a battle: hours of cramped waiting, dosimeter checks, and deciding which tasks really need someone outside the best protected part of the ship.',
    choices: [
      { id: 'shelter', label: 'Keep everyone in the shelter', description: 'Limit exposure by suspending outside tasks and exercises.', outcome: 'People emerge stiff and irritable. The dosimeters show why the lost working time was worthwhile.', effect: { stats: { crew: -2, readiness: -5 } } },
      { id: 'shifts', label: 'Continue only essential shifts', description: 'Protect the work schedule at a higher radiation dose.', outcome: 'The necessary work gets done. Medical records now carry exposures that cannot be erased.', effect: { stats: { crew: -8 } } },
      { id: 'prepared', label: 'Use the rehearsed shelter plan', description: 'Apply the radiation project’s layout and routines to shelter efficiently.', outcome: 'The repacked stores and rehearsed handovers help. The crew completes a real shelter exercise without improvising the basics.', requiresProject: 'radiation', effect: { stats: { crew: -2, readiness: 2 } } },
    ],
  },
  {
    id: 'cabin', category: 'cohesion', title: 'The same thirty voices',
    minMonth: 5,
    body: 'A disagreement about borrowed headphones has occupied two departments for three days. Nobody thinks it is really about the headphones. The ship has become a small collection of territories: favorite seats, quiet hours, people who always clear up after dinner. A few crew members ask for a proper break together. Others would prefer firmer boundaries and a schedule they can trust. Both groups are tired of being told to be resilient.',
    choices: [
      { id: 'holiday', label: 'Give the ship a shared holiday', description: 'Set aside arrival exercises so people can enjoy each other’s company.', outcome: 'A terrible improvised quiz and an unexpectedly good meal give people something else to talk about.', effect: { stats: { crew: 7, readiness: -5 } } },
      { id: 'boundaries', label: 'Rework quiet hours and boundaries', description: 'Spend materials on partitions and personal spaces.', outcome: 'Small private corners appear. The agreements are imperfect, but people helped write them.', effect: { stats: { crew: 3, supplies: -3 } } },
      { id: 'training', label: 'Let trained backups swap duties', description: 'Use cross-training to break the routine and practice working together.', outcome: 'A week in different roles changes several opinions about who has the easiest job aboard.', requiresProject: 'training', effect: { stats: { crew: 5, readiness: 2 } } },
    ],
  },
  {
    id: 'earth_request', category: 'earth', title: 'A request from home',
    minMonth: 3, maxMonth: 18,
    body: 'An Earth research consortium offers access to new Europa observations if your crew will process an awkward calibration set. The work was not in the departure agreement. Back home, funding has become a public argument, and the consortium wants something tangible to show. Their scientists sound embarrassed by the politics. You have useful instruments and expertise, but every hour offered to Earth is an hour taken from preparing thirty people for Callisto.',
    choices: [
      { id: 'collaborate', label: 'Contribute the calibration work', description: 'Divert crew time into research for a chance of valuable data later.', outcome: 'A careful dataset leaves for Earth. The scientists promise to send their own results once the release is approved.', effect: { stats: { crew: -3, readiness: -3 }, science: 3, addFlag: 'earth_data', followUp: { eventId: 'earth_reply', afterMonths: 4, chance: 0.8 } } },
      { id: 'summary', label: 'Send a short existing-data summary', description: 'Offer a modest contribution without a promise of follow-up data.', outcome: 'You send something useful without taking on the full request. The reply is polite and brief.', effect: { stats: { readiness: -1 }, science: 1 } },
      { id: 'decline', label: 'Protect the arrival work', description: 'Keep preparing for Callisto, disappointing the science team.', outcome: 'Your reply points to the expedition’s limited working hours. The science team understands the arithmetic and dislikes the decision.', effect: { stats: { readiness: 3, crew: -2 } } },
    ],
  },
  {
    id: 'europa_data', category: 'science', title: 'The shape of the evidence',
    minMonth: 8,
    body: 'A new packet of Europan observations reaches the ship. The evidence for life remains compelling, but one instrument’s calibration leaves a narrow ambiguity about where a chemical signature originates. Your scientists want to reproduce the analysis before selecting their first sampling targets. The settlement team points out that a better target does not build a habitat. Both are right; the message contains enough work to consume whatever time you are willing to give it.',
    choices: [
      { id: 'study', label: 'Put a team on the raw observations', description: 'Spend effort and arrival preparation time on a deeper scientific analysis.', outcome: 'The team identifies a promising region and writes down the uncertainties just as carefully as the result.', effect: { science: 8, stats: { crew: -4, readiness: -3 } } },
      { id: 'archive', label: 'Archive it and finish arrival drills', description: 'Learn the essentials, then put the crew’s effort into deployment practice.', outcome: 'A concise briefing preserves the essentials. The rest of the week goes to equipment deployment rehearsals.', effect: { science: 2, stats: { readiness: 4, crew: -2 } } },
      { id: 'prepared', label: 'Run the calibrated research workflow', description: 'Use the Europa project’s groundwork to extract more from the data.', outcome: 'The prepared workflow handles the calibration problem. Your sampling plan gains both a stronger target and a clear control experiment.', requiresProject: 'europa', effect: { science: 10, stats: { crew: -2 } } },
    ],
  },
  {
    id: 'overtime', category: 'workload', title: 'The volunteers keep volunteering',
    minMonth: 4, maxMonth: 19,
    body: 'The same handful of people have been covering missed exercises, minor repairs, and late communications shifts. They insist they are fine. The medical officer’s sleep records suggest otherwise. There is a chance to clear a real backlog before it becomes a problem near Jupiter, and nobody wants to tell willing adults to stop helping. But this is a voyage measured in years. A good month can quietly borrow its performance from several bad ones later.',
    choices: [
      { id: 'rest', label: 'Stand down the extra shifts', description: 'Let people recover while some arrival work waits.', outcome: 'The backlog stays visible. So does your decision to take recovery time seriously.', effect: { stats: { crew: 5, readiness: -4 } } },
      { id: 'push', label: 'Accept one concentrated push', description: 'Clear the arrival backlog quickly, risking exhaustion later.', outcome: 'The backlog shrinks impressively. For now, the volunteers call it a successful week.', effect: { stats: { readiness: 9, crew: -4 }, addFlag: 'overworked', followUp: { eventId: 'exhaustion', afterMonths: 2, chance: 0.7 } } },
      { id: 'project', label: 'Pause the project and share the load', description: 'Delay the project so the backlog can be cleared within normal shifts.', outcome: 'With more hands available, the necessary work fits inside normal shifts. The project milestone moves back.', requiresActiveProject: true, effect: { delay: 1, stats: { readiness: 5, crew: 2 } } },
    ],
  },
  {
    id: 'spares', category: 'equipment', title: 'One box, two purposes',
    minMonth: 7,
    body: 'An inventory audit finds that a set of sealed power regulators is listed twice: once as ship spares and once inside the first surface power kit. The hardware is all aboard. The duplicate promise is in the paperwork. Someone must decide which system gets a proper reserve, or spend general workshop stock making adapters so the units can serve both. It is an ordinary departure mistake that will become much less ordinary after arrival.',
    choices: [
      { id: 'ship', label: 'Reserve them for the ship', description: 'Improve engineering reserves at the expense of the surface power kit.', outcome: 'Engineering gains a credible reserve. The surface power checklist gains a gap that everybody can now see.', effect: { stats: { ship: 6, readiness: -5 } } },
      { id: 'surface', label: 'Seal them in the surface kit', description: 'Complete the arrival kit and leave the ship with fewer spares.', outcome: 'The surface kit is complete. Engineering begins inspecting its installed regulators more frequently.', effect: { stats: { readiness: 7, ship: -4 } } },
      { id: 'adapters', label: 'Build and test shared adapters', description: 'Spend workshop stock to make the reserve useful to both teams.', outcome: 'Both teams sign off on the adapters. The reserve is still small, but it can go where it is needed.', effect: { stats: { supplies: -7, ship: 3, readiness: 4 } } },
    ],
  },
  {
    id: 'food', category: 'habitat', title: 'Dinner tastes like the calendar',
    minMonth: 6,
    body: 'The food stores meet nutritional requirements. That is the nicest thing anyone has said about them lately. Several crew members have started skipping parts of dinner, and the medical officer sees the pattern in their logs. There are limited celebration ingredients, a few experimental plants, and a cook with more enthusiasm than options. You can spend variety now, change how meals happen, or ask everyone to accept that adequate food is one of the voyage’s constraints.',
    choices: [
      { id: 'treats', label: 'Open some reserved ingredients', description: 'Spend food reserves to make dinner something people look forward to.', outcome: 'The smell of something different reaches every compartment. Dinner takes longer than usual, in a good way.', effect: { stats: { supplies: -5, crew: 7 } } },
      { id: 'meals', label: 'Give the crew time to cook together', description: 'Trade some arrival practice for better meals and shared evenings.', outcome: 'People trade recipes with implausible substitutions. The food improves a little; the evenings improve more.', effect: { stats: { readiness: -4, crew: 4 } } },
      { id: 'harvest', label: 'Bring in a reliable fresh harvest', description: 'Use the agriculture system to improve meals and replenish food stores.', outcome: 'The crop room contributes real food. Everyone understands exactly how much work those leaves represent.', requiresProject: 'agriculture', effect: { stats: { crew: 6, supplies: 3 } } },
    ],
  },
  {
    id: 'antenna', category: 'communications', title: 'Messages arrive in fragments',
    minMonth: 5,
    body: 'The high-gain antenna still points correctly, but an aging amplifier is reducing the margin on Earth transmissions. Nothing important has been lost yet; files arrive slowly after repeated requests. Family recordings compete with technical updates for reliable transfer windows. Replacing the unit uses a valuable spare. A lower-rate schedule would work with the existing hardware, if you decide whose messages can wait. The communications officer would like that decision to come from the captain.',
    choices: [
      { id: 'replace', label: 'Replace the amplifier', description: 'Spend a valuable spare to restore the link for everyone.', outcome: 'The link margin improves. A queue of family recordings downloads while most of the ship sleeps.', effect: { stats: { supplies: -7, ship: 3, crew: 2 } } },
      { id: 'families', label: 'Prioritize personal messages', description: 'Keep people connected to home while technical and research files wait.', outcome: 'People hear familiar voices. Technical files wait for the remaining transmission windows.', effect: { stats: { crew: 4, readiness: -4 }, science: -2 } },
      { id: 'technical', label: 'Prioritize operational files', description: 'Keep working datasets current while personal messages fall behind.', outcome: 'The working datasets stay current. The communications officer posts a longer wait for personal recordings.', effect: { stats: { readiness: 4, crew: -5 }, science: 2 } },
    ],
  },
  {
    id: 'recycler_leak', category: 'consequence', title: 'The yellow maintenance tag',
    followUpOnly: true, requiresFlag: 'recycler_patch',
    body: 'The patched water recycler has begun to leak into its equipment tray. Imani recognizes the yellow tag before opening the panel. The earlier repair bought time, but the housing has distorted around it, and this job is larger than the original replacement would have been. The leak is contained. You can spend the spare and extra seals, reduce throughput while the crew works around it, or pull the project team into a careful rebuild.',
    choices: [
      { id: 'replace', label: 'Use the spare and new seals', description: 'Spend extra repair stock to solve the recycler problem permanently.', outcome: 'The damaged housing comes out in two pieces. The new assembly passes its pressure test.', effect: { stats: { supplies: -11, ship: 2 }, removeFlag: 'recycler_patch' } },
      { id: 'bypass', label: 'Isolate the unit and share the load', description: 'Preserve stores by accepting reduced redundancy and harder water routines.', outcome: 'The remaining loop carries the load. You have stopped the leak by giving up an important layer of redundancy.', effect: { stats: { ship: -7, crew: -6 }, removeFlag: 'recycler_patch' } },
      { id: 'rebuild', label: 'Put the project team on the repair', description: 'Spend crew effort and project time on a careful rebuild.', outcome: 'The team rebuilds the housing and tests it slowly. The project loses two months to a repair that cannot wait.', requiresActiveProject: true, effect: { delay: 2, stats: { crew: -4, ship: 1 }, removeFlag: 'recycler_patch' } },
    ],
  },
  {
    id: 'exhaustion', category: 'consequence', title: 'The borrowed time comes due',
    followUpOnly: true, requiresFlag: 'overworked',
    body: 'Two of the people who cleared the backlog are now making small mistakes. A third has stopped volunteering and barely speaks at meals. The medical officer connects the pattern to the concentrated push you approved earlier. No one incident is dramatic. Together they are a warning that the crew cannot keep operating at the level the recent records suggest. A recovery plan will cost something; pretending the problem is only attitude will also cost something.',
    choices: [
      { id: 'recover', label: 'Clear space for real recovery', description: 'Give up planned exercises so exhausted people can rest.', outcome: 'Rest happens on the roster rather than in the margins. The mistakes become less frequent.', effect: { stats: { readiness: -7, crew: 4 }, removeFlag: 'overworked' } },
      { id: 'comfort', label: 'Use reserves to ease daily work', description: 'Spend convenience stores to reduce chores, with a smaller training break.', outcome: 'Convenience food and replacement consumables reduce the small jobs. The extra margin helps people recover.', effect: { stats: { supplies: -6, readiness: -2, crew: 3 }, removeFlag: 'overworked' } },
      { id: 'continue', label: 'Keep the schedule with lighter checks', description: 'Preserve arrival preparation at the expense of people and maintenance.', outcome: 'The schedule survives, but the crew and equipment absorb the difference. Nobody volunteers for another push.', effect: { stats: { crew: -8, ship: -3 }, removeFlag: 'overworked' } },
    ],
  },
  {
    id: 'earth_reply', category: 'consequence', title: 'Earth keeps its promise',
    followUpOnly: true, requiresFlag: 'earth_data',
    body: 'The consortium sends its promised data release, together with a personal note thanking your calibration team. Your earlier work helped separate an instrument artifact from a real signal. The packet includes improved Europa observations and useful engineering comparisons from terrestrial cold-environment trials. There is more here than the crew can absorb at once. It is a welcome problem, but choosing what to study still means choosing what people will spend their next working hours doing.',
    choices: [
      { id: 'surface', label: 'Apply the engineering comparisons', description: 'Put the crew to work turning Earth’s results into better arrival procedures.', outcome: 'The surface team revises its deployment checks using the new evidence. Several assumptions become actual procedures.', effect: { stats: { readiness: 8, crew: -3 }, science: 2, removeFlag: 'earth_data' } },
      { id: 'science', label: 'Study the Europa observations', description: 'Redirect preparation time and crew effort toward the scientific opportunity.', outcome: 'Your scientists narrow the sampling targets. The collaboration has produced a result neither team could have reached alone.', effect: { stats: { readiness: -3, crew: -2 }, science: 9, removeFlag: 'earth_data' } },
      { id: 'brief', label: 'Share a briefing and bank the rest', description: 'Learn the essentials and celebrate the contribution without a full analysis.', outcome: 'A shipwide briefing makes the contribution feel real. The full packet remains available for the people who will eventually use it.', effect: { stats: { crew: 2 }, science: 3, removeFlag: 'earth_data' } },
    ],
  },
];

export const QUIET_EVENT: VoyageEvent = {
  id: 'quiet', category: 'routine', title: 'A month of ordinary work',
  body: 'The ship crosses another stretch of empty space. Telemetry stays within expected limits. Meals, exercise, sleep, and maintenance fill the days; Earth’s reply to a message arrives after the conversation has already moved on. Routine work continues around the ship. There is room this month to give one part of shipboard life some extra attention. Nothing is demanding an immediate answer, which makes this a useful chance to choose what deserves one.',
  choices: [
    { id: 'maintenance', label: 'Give engineering a maintenance window', description: 'Use spare materials to catch up on wear and small repairs.', outcome: 'Small leaks, worn fittings, and awkward workarounds disappear from the engineering list. The ship feels less tired.', effect: { stats: { ship: 6, supplies: -3 } } },
    { id: 'recreation', label: 'Make room for life aboard', description: 'Let some drills wait while people recover and spend time together.', outcome: 'People spend time together without a checklist. The unfinished drills can wait a little longer.', effect: { stats: { crew: 6, readiness: -2 } } },
    { id: 'rehearsal', label: 'Rehearse the first days on Callisto', description: 'Ask the crew for extra effort now to make arrival procedures familiar.', outcome: 'The crew walks through unloading, power, and shelter procedures. A few imagined surprises become things they already know how to handle.', effect: { stats: { readiness: 3, crew: -2 } } },
  ],
};

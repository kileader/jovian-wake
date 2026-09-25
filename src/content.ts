import type { CardDefinition, Crisis, VoyageEvent } from './types.ts';

export const DEFAULT_MONTHS = 12;
export const CRISIS_POINTS = 3;

// Supply piles represent capabilities and stores prepared aboard the ship, not resupply.
export const CARDS: CardDefinition[] = [
  {
    id: 'crew-shift', name: 'Crew Shift', type: 'Work', cost: 0, supply: 30,
    text: '+1 Work.',
    flavor: 'A practiced pair of hands and a clear task.',
    effect: { work: 1 },
  },
  {
    id: 'specialist-shift', name: 'Specialist Shift', type: 'Work', cost: 3, supply: 20,
    text: '+2 Work.',
    flavor: 'Training turns familiar procedures into reliable specialist work.',
    effect: { work: 2 },
  },
  {
    id: 'expert-shift', name: 'Expert Shift', type: 'Work', cost: 6, supply: 15,
    text: '+3 Work.',
    flavor: 'Enough rehearsal to recognize the problem before opening the panel.',
    effect: { work: 3 },
  },
  {
    id: 'colony-stores', name: 'Colony Stores', type: 'Cargo', cost: 2, supply: 12,
    text: 'Worth 1 point at arrival. No play effect.',
    flavor: 'Existing materials inspected, packed, and reserved for the first days on Callisto.',
    points: 1,
  },
  {
    id: 'streamlining', name: 'Streamlining', type: 'Ops', cost: 2, supply: 10,
    text: 'Retire up to 4 cards from your hand.',
    flavor: 'Close stale work orders and stop carrying procedures nobody needs.',
    effect: { special: 'retire' },
  },
  {
    id: 'crew-sync', name: 'Crew Sync', type: 'Ops', cost: 3, supply: 10,
    text: '+1 card. +2 Ops.',
    flavor: 'A useful handover leaves the next shift ready to act.',
    effect: { draw: 1, ops: 2 },
  },
  {
    id: 'integrated-diagnostics', name: 'Integrated Diagnostics', type: 'Ops', cost: 4, supply: 10,
    text: '+3 cards.',
    flavor: 'Compare the instruments before deciding which one to trust.',
    effect: { draw: 3 },
  },
  {
    id: 'salvage', name: 'Salvage', type: 'Ops', cost: 4, supply: 10,
    text: '+1 Work. You may retire 1 card from your hand. If it is Cargo, gain +2 additional Work.',
    flavor: 'A prepared surface kit can solve a shipboard problem, if you are willing to unpack it.',
    effect: { work: 1, special: 'salvage' },
  },
  {
    id: 'cross-training', name: 'Cross-Training', type: 'Ops', cost: 5, supply: 10,
    text: '+2 cards. +1 Ops.',
    flavor: 'Thirty people cannot cover every specialty. They can learn to cover one another.',
    effect: { draw: 2, ops: 1 },
  },
  {
    id: 'parallel-programs', name: 'Parallel Programs', type: 'Ops', cost: 5, supply: 10,
    text: '+1 card. +1 Ops. +1 Work. +1 Buy.',
    flavor: 'Prepare the next procedure while another team finishes the current one.',
    effect: { draw: 1, ops: 1, work: 1, buys: 1 },
  },
  {
    id: 'rapid-prototyping', name: 'Rapid Prototyping', type: 'Ops', cost: 3, supply: 10,
    text: 'Gain an Ops card costing up to 4 Work.',
    flavor: 'Turn a bench test into a procedure the whole crew can use.',
    effect: { special: 'gain-ops' },
  },
  {
    id: 'load-balancing', name: 'Load Balancing', type: 'Ops', cost: 2, supply: 10,
    text: '+1 Ops. Discard any number of cards from your hand, then draw that many.',
    flavor: 'Move the jobs that can wait and find the people ready for what cannot.',
    effect: { ops: 1, special: 'discard-redraw' },
  },
  {
    id: 'systems-integration', name: 'Systems Integration', type: 'Ops', cost: 4, supply: 10,
    text: 'Retire 1 card from your hand. Gain a card costing up to 2 Work more.',
    flavor: 'Rebuild an existing capability around what the expedition has learned.',
    effect: { special: 'upgrade' },
  },
  {
    id: 'predictive-maintenance', name: 'Predictive Maintenance', type: 'Ops', cost: 5, supply: 10,
    text: '+1 card. +1 Ops. Inspect the top 2 cards: retire, discard, or return each in any order.',
    flavor: 'A trend in the maintenance log is cheaper to act on than a failed bearing.',
    effect: { draw: 1, ops: 1, special: 'inspect' },
  },
  {
    id: 'fatigue', name: 'Fatigue', type: 'Burden', cost: 0, supply: 0,
    text: 'No effect.',
    flavor: 'The long shift ended. Its cost is still aboard.',
  },
  {
    id: 'repair-backlog', name: 'Repair Backlog', type: 'Burden', cost: 0, supply: 0,
    text: 'No effect.',
    flavor: 'Another yellow tag, waiting for the right hands and enough time.',
  },
  {
    id: 'exposure-monitoring', name: 'Exposure Monitoring', type: 'Burden', cost: 0, supply: 0,
    text: 'No effect.',
    flavor: 'Extra dosimeter checks become part of the daily routine.',
  },
  {
    id: 'crew-conflict', name: 'Crew Conflict', type: 'Burden', cost: 0, supply: 0,
    text: 'No effect.',
    flavor: 'An unresolved argument follows its participants from shift to shift.',
  },
  {
    id: 'medical-followup', name: 'Medical Follow-Up', type: 'Burden', cost: 0, supply: 0,
    text: 'No effect.',
    flavor: 'Recovery is going well. It still needs somebody’s attention.',
  },
];

export const EVENTS: VoyageEvent[] = [
  {
    id: 'sensor-drift', name: 'Sensor Drift',
    description: 'The coolant instruments disagree by a little more each week. Sorting out the calibration now takes people away from other jobs. Leaving it creates another maintenance obligation.',
    rule: 'Discard 2 cards of any type, or gain a Repair Backlog.',
    effect: { kind: 'discard-or-burden', count: 2, burden: 'repair-backlog' },
  },
  {
    id: 'earth-political-shock', name: 'Earth Political Shock',
    description: 'A dispute among Earth’s sponsors delays the release of technical reference packages. The crew must prepare new procedures from a smaller set of approved documentation this month.',
    rule: 'Only 3 randomly selected Ops piles are available for any acquisition this month. Work and Cargo remain available.',
    effect: { kind: 'restricted-ops', available: 3 },
  },
  {
    id: 'solar-particle-event', name: 'Solar Particle Event',
    description: 'Particle readings rise. The shelter is ready, but thirty people cannot work normally inside it. Dosimeter checks and hours spent sheltering leave less useful working time.',
    rule: 'Start this month with 4 cards instead of 5.',
    effect: { kind: 'short-hand', cards: 4 },
  },
  {
    id: 'micrometeoroid-strike', name: 'Micrometeoroid Strike',
    description: 'A small impact damages an unpressurized outer panel. There is no cabin leak, but inspection and a local repair need hands now. Postponing the job adds to the maintenance list.',
    rule: 'Discard 2 Work cards, or gain a Repair Backlog.',
    effect: { kind: 'discard-or-burden', count: 2, cardType: 'Work', burden: 'repair-backlog' },
  },
  {
    id: 'cabin-fever', name: 'Cabin Fever',
    description: 'A disagreement over quiet hours spreads across two shifts. Making time to settle it interrupts planned work. Carrying on leaves the argument aboard with everyone else.',
    rule: 'Discard 1 Ops card, or gain a Crew Conflict.',
    effect: { kind: 'discard-or-burden', count: 1, cardType: 'Ops', burden: 'crew-conflict' },
  },
];

export const CRISES: Crisis[] = [
  {
    id: 'coolant-deviation', name: 'Coolant Deviation',
    description: 'A cooling branch is running warmer than expected. The crew needs a focused maintenance window to isolate the cause and restore its operating margin.',
    handSize: 5, requiredOps: 0, requiredWork: 4, burden: 'repair-backlog',
    successText: 'The crew isolates a restricted valve and restores normal flow. The repair is tested and closed.',
    failureText: 'Reduced load keeps temperatures within limits, but the unfinished repair joins the backlog.',
  },
  {
    id: 'power-bus-redundancy', name: 'Power Bus Redundancy',
    description: 'A scheduled failover test reveals an unreliable contactor. Restoring the backup path takes sustained work while the healthy bus carries essential loads.',
    handSize: 5, requiredOps: 0, requiredWork: 6, burden: 'fatigue',
    successText: 'The repaired contactor passes repeated failover tests. Essential systems have a reliable backup again.',
    failureText: 'The safe operating arrangement needs extra manual checks. The added watchkeeping leaves people tired.',
  },
  {
    id: 'cooling-loop-failure', name: 'Cooling Loop Failure',
    description: 'A coolant leak forces the crew to isolate a loop. Restricted workspaces leave fewer options, and the repair needs coordinated procedures as well as labor.',
    handSize: 4, requiredOps: 2, requiredWork: 5, burden: 'repair-backlog',
    successText: 'Isolation, repair, and pressure testing fit together. The loop returns to service with the leak resolved.',
    failureText: 'The backup loop holds at reduced capacity. Restoring the damaged branch remains unfinished work.',
  },
  {
    id: 'arrival-integration-test', name: 'Arrival Integration Test',
    description: 'The crew rehearses the handover from cruise systems to surface preparations. Power, cargo handling, and shelter procedures must work together, with no team assuming another has covered the gap.',
    handSize: 5, requiredOps: 2, requiredWork: 7, burden: 'crew-conflict',
    successText: 'The teams complete a coherent rehearsal and resolve the awkward handovers before arrival.',
    failureText: 'Unfinished handovers expose conflicting expectations. The crews arrive with an argument still to settle.',
  },
];

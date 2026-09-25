import type { CardDefinition, CargoFamily, Crisis, VoyageEvent } from './types.ts';

export const DEFAULT_MONTHS = 12;
export const CARGO_FAMILIES: { id: CargoFamily; name: string; purpose: string }[] = [
  { id: 'habitat', name: 'Habitat', purpose: 'Living space, medical care, and life-support reserves.' },
  { id: 'industry', name: 'Industry', purpose: 'Repairs, spare parts, and local fabrication.' },
  { id: 'science', name: 'Science', purpose: 'Instruments and equipment for the Europa mission.' },
];
const BURDEN_TEXT = 'Cannot be played. Occupies a hand slot when drawn. Each unresolved Burden costs 1 point at arrival. Retire it to remove both costs.';

// Acquisitions represent preparation of capabilities and equipment already aboard.
export const CARDS: CardDefinition[] = [
  {
    id: 'crew-shift', name: 'Crew Shift', type: 'Work', cost: 0,
    text: '+1 Work.',
    flavor: 'A practiced pair of hands and a clear task.',
    effect: { work: 1 },
  },
  {
    id: 'specialist-shift', name: 'Specialist Shift', type: 'Work', cost: 3,
    text: '+2 Work.',
    flavor: 'Training turns familiar procedures into reliable specialist work.',
    effect: { work: 2 },
  },
  {
    id: 'expert-shift', name: 'Expert Shift', type: 'Work', cost: 6,
    text: '+3 Work.',
    flavor: 'Enough rehearsal to recognize the problem before opening the panel.',
    effect: { work: 3 },
  },
  {
    id: 'colony-stores', name: 'Colony Stores', type: 'Cargo', cost: 2,
    text: 'Habitat Cargo. Worth 1 point at arrival. Can be consumed for a Habitat crisis response from anywhere in your deck. No normal play effect.',
    flavor: 'Existing materials inspected, packed, and reserved for the first days on Callisto.',
    points: 1, cargoFamily: 'habitat',
  },
  {
    id: 'habitation-modules', name: 'Habitation Modules', type: 'Cargo', cost: 5,
    text: 'Habitat Cargo. Worth 3 points at arrival. Can be consumed for a Habitat crisis response from anywhere in your deck. No normal play effect.',
    flavor: 'Stowed shelter sections tested, outfitted, and repacked for deployment on Callisto.',
    points: 3, cargoFamily: 'habitat',
  },
  {
    id: 'industrial-core', name: 'Industrial Core', type: 'Cargo', cost: 5,
    text: 'Industry Cargo. Worth 3 points at arrival. Can be consumed for an Industry crisis response from anywhere in your deck. No normal play effect.',
    flavor: 'Machine tools and power hardware already aboard, tested and prepared as a working surface workshop.',
    points: 3, cargoFamily: 'industry',
  },
  {
    id: 'europa-instruments', name: 'Europa Instruments', type: 'Cargo', cost: 5,
    text: 'Science Cargo. Worth 3 points at arrival. Can be consumed for a Science crisis response from anywhere in your deck. No normal play effect.',
    flavor: 'Calibrated reference sensors and sample-analysis hardware reserved for the Europa mission.',
    points: 3, cargoFamily: 'science',
  },
  {
    id: 'streamlining', name: 'Streamlining', type: 'Ops', cost: 2,
    text: 'Permanently retire up to 4 cards from your hand.',
    flavor: 'Close stale work orders and stop carrying procedures nobody needs.',
    effect: { special: 'retire' },
  },
  {
    id: 'crew-sync', name: 'Crew Sync', type: 'Ops', cost: 3,
    text: 'Draw 1 card. +2 Ops plays.',
    flavor: 'A useful handover leaves the next shift ready to act.',
    effect: { draw: 1, ops: 2 },
  },
  {
    id: 'integrated-diagnostics', name: 'Integrated Diagnostics', type: 'Ops', cost: 4,
    text: 'Draw 3 cards.',
    flavor: 'Compare the instruments before deciding which one to trust.',
    effect: { draw: 3 },
  },
  {
    id: 'salvage', name: 'Salvage', type: 'Ops', cost: 4,
    text: '+1 Work. You may permanently retire 1 card from your hand. If it is Cargo, gain 2 additional Work.',
    flavor: 'A prepared surface kit can solve a shipboard problem, if you are willing to unpack it.',
    effect: { work: 1, special: 'salvage' },
  },
  {
    id: 'cross-training', name: 'Cross-Training', type: 'Ops', cost: 5,
    text: 'Draw 2 cards. +1 Ops play.',
    flavor: 'Thirty people cannot cover every specialty. They can learn to cover one another.',
    effect: { draw: 2, ops: 1 },
  },
  {
    id: 'parallel-programs', name: 'Parallel Programs', type: 'Ops', cost: 5,
    text: 'Draw 1 card. +1 Ops play. +1 Work. +1 Buy.',
    flavor: 'Prepare the next procedure while another team finishes the current one.',
    effect: { draw: 1, ops: 1, work: 1, buys: 1 },
  },
  {
    id: 'rapid-prototyping', name: 'Rapid Prototyping', type: 'Ops', cost: 3,
    text: 'Gain an Ops card costing up to 4 Work into your discard pile, without spending Work or a Buy.',
    flavor: 'Turn a bench test into a procedure the whole crew can use.',
    effect: { special: 'gain-ops' },
  },
  {
    id: 'load-balancing', name: 'Load Balancing', type: 'Ops', cost: 2,
    text: '+1 Ops play. Discard any number of cards from your hand, then draw that many.',
    flavor: 'Move the jobs that can wait and find the people ready for what cannot.',
    effect: { ops: 1, special: 'discard-redraw' },
  },
  {
    id: 'systems-integration', name: 'Systems Integration', type: 'Ops', cost: 4,
    text: 'Permanently retire 1 card from your hand. Gain a card costing up to 2 Work more than the retired card into your discard pile, without spending Work or a Buy.',
    flavor: 'Rebuild an existing capability around what the expedition has learned.',
    effect: { special: 'upgrade' },
  },
  {
    id: 'predictive-maintenance', name: 'Predictive Maintenance', type: 'Ops', cost: 5,
    text: 'Draw 1 card. +1 Ops play. Inspect the top 2 cards of your deck. Retire cards permanently, discard cards for later, or return them to the top in any order.',
    flavor: 'A trend in the maintenance log is cheaper to act on than a failed bearing.',
    effect: { draw: 1, ops: 1, special: 'inspect' },
  },
  {
    id: 'fatigue', name: 'Fatigue', type: 'Burden', cost: 0,
    text: BURDEN_TEXT,
    flavor: 'The long shift ended. Its cost is still aboard.',
  },
  {
    id: 'repair-backlog', name: 'Repair Backlog', type: 'Burden', cost: 0,
    text: BURDEN_TEXT,
    flavor: 'Another yellow tag, waiting for the right hands and enough time.',
  },
  {
    id: 'exposure-monitoring', name: 'Exposure Monitoring', type: 'Burden', cost: 0,
    text: BURDEN_TEXT,
    flavor: 'Extra dosimeter checks become part of the daily routine.',
  },
  {
    id: 'crew-conflict', name: 'Crew Conflict', type: 'Burden', cost: 0,
    text: BURDEN_TEXT,
    flavor: 'An unresolved argument follows its participants from shift to shift.',
  },
  {
    id: 'medical-followup', name: 'Medical Follow-Up', type: 'Burden', cost: 0,
    text: BURDEN_TEXT,
    flavor: 'Recovery is going well. It still needs somebody’s attention.',
  },
];

export const EVENTS: VoyageEvent[] = [
  {
    id: 'bearing-wear', name: 'Bearing Wear',
    description: 'A ventilation fan still works, but vibration readings put it on the maintenance list. Even a well-run ship accumulates jobs.',
    rule: 'Gain 1 Repair Backlog in discard. This happens automatically; play your normal hand afterward.',
    effect: { kind: 'gain-burden', burden: 'repair-backlog' },
  },
  {
    id: 'interrupted-sleep', name: 'Interrupted Sleep',
    description: 'A week of alarms and broken sleep leaves the duty crew tired. The fault is contained; recovery will take longer.',
    rule: 'Gain 1 Fatigue in discard. This happens automatically; play your normal hand afterward.',
    effect: { kind: 'gain-burden', burden: 'fatigue' },
  },
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
    id: 'coolant-leak', name: 'Coolant Leak',
    description: 'A cooling branch has been isolated. Repair it using crew time, strip parts from a prepared industrial kit, or keep the backup loop running and carry the unfinished work.',
    workCost: 4, workText: 'Fabricate a replacement seal and pressure-test the repaired loop.',
    cargoFamily: 'industry', cargoText: 'Cannibalize an industrial kit for compatible valves and seals.',
    burden: 'repair-backlog', burdenCount: 2,
    deferText: 'Keep the backup loop in service. The damaged branch still needs repair and testing.',
  },
  {
    id: 'medical-isolation', name: 'Medical Isolation',
    description: 'A contagious illness needs a temporary isolation area. The crew can rebuild a compartment, open a reserved habitat kit, or manage recovery with extra rounds and cleaning.',
    workCost: 4, workText: 'Refit a compartment and establish a safe care routine.',
    cargoFamily: 'habitat', cargoText: 'Use reserved habitat supplies to outfit an isolation area.',
    burden: 'medical-followup', burdenCount: 2,
    deferText: 'Manage the illness with extra care shifts. Follow-up work stays with the crew.',
  },
  {
    id: 'dosimeter-drift', name: 'Dosimeter Drift',
    description: 'Personal dosimeters disagree with the fixed sensors. Recalibrate them with crew time, dedicate Europa reference instruments to monitoring, or add manual checks until the discrepancy is resolved.',
    workCost: 5, workText: 'Cross-check the instruments and recalibrate the dosimeters.',
    cargoFamily: 'science', cargoText: 'Permanently dedicate a Europa instrument package to shipboard monitoring.',
    burden: 'exposure-monitoring', burdenCount: 2,
    deferText: 'Use conservative exposure limits and extra manual checks.',
  },
  {
    id: 'power-bus-redundancy', name: 'Power Bus Redundancy',
    description: 'A failover test exposes an unreliable contactor. Restoring the backup path competes with other work; carrying on requires additional watchkeeping.',
    workCost: 6, workText: 'Rebuild the contactor and repeat the failover tests.',
    cargoFamily: 'industry', cargoText: 'Strip switching hardware from a prepared industrial kit.',
    burden: 'fatigue', burdenCount: 2,
    deferText: 'Run extra manual checks on the remaining bus. The added watchkeeping costs the crew sleep.',
  },
];

// Eight operational periods, using deliberately abstract capacities rather than physical units.
export const SYSTEMS = ['power', 'cooling', 'recycler'] as const;
export type SystemId = typeof SYSTEMS[number];
export const SYSTEM_NAMES: Record<SystemId, string> = {
  power: 'Power unit', cooling: 'Cooling loop', recycler: 'Life-support recycler',
};
export const CREW = {
  engineer: { name: 'Mira Chen', role: 'Systems engineer' },
  operator: { name: 'Alex Okafor', role: 'Operations specialist' },
} as const;
export type CrewId = keyof typeof CREW;
export const CASES = ['WAKE-01', 'WAKE-02', 'WAKE-03', 'WAKE-04'] as const;
export type CaseId = typeof CASES[number];
export type Job = 'fabricate' | 'commission' | 'science';
export type EngineeringAction = Job | `inspect:${SystemId}` | `maintain:${SystemId}` | `repair:${SystemId}`;
export type WearBand = 'sound' | 'worn' | 'degraded';
export interface Finding { turn: number; band: WearBand; wear: number | null }
export interface Equipment {
  wear: number;
  serviceAge: number;
  finding: Finding | null;
  serviced: boolean;
  repaired: boolean;
}
export interface EngineeringEntry { turn: number; text: string; truth?: string }
export interface EngineeringState {
  caseId: CaseId;
  turn: number;
  systems: Record<SystemId, Equipment>;
  available: Record<CrewId, boolean>;
  jobs: { kind: Job; crew: CrewId }[];
  mode: 'protected' | 'override';
  priority: 'life' | 'projects';
  reserves: number;
  spares: number;
  feedstock: number;
  habitat: number;
  science: number;
  history: EngineeringEntry[];
  reports: PeriodReport[];
  status: 'active' | 'viable' | 'failed';
}
export interface Readings {
  requested: number;
  delivered: number;
  thermalStress: number;
  output: number;
  demand: number;
  reserveUse: number;
  unmetDemand: number;
  jobPower: number[];
}
export interface PeriodReport extends Readings {
  turn: number;
  mode: EngineeringState['mode'];
  priority: EngineeringState['priority'];
  jobs: { kind: Job; complete: boolean }[];
  wear: Record<SystemId, number>;
}

export function wearBand(wear: number): WearBand {
  return wear < 3 ? 'sound' : wear < 6 ? 'worn' : 'degraded';
}

export function createEngineering(caseId: CaseId = 'WAKE-01'): EngineeringState {
  const selected = CASES.includes(caseId) ? caseId : 'WAKE-01';
  // Case labels conceal the starting cause. Subsequent changes use no random rolls.
  const wear: Record<CaseId, number[]> = {
    'WAKE-01': [1, 5, 1], 'WAKE-02': [5, 1, 1],
    'WAKE-03': [1, 1, 4], 'WAKE-04': [1, 1, 1],
  };
  const systems = Object.fromEntries(SYSTEMS.map((id, i) => [id, {
    wear: wear[selected][i], serviceAge: 0, finding: null, serviced: false, repaired: false,
  }])) as Record<SystemId, Equipment>;
  return {
    caseId: selected, turn: 1, systems, available: { engineer: true, operator: true }, jobs: [],
    mode: 'protected', priority: 'life', reserves: 7, spares: 2, feedstock: 2,
    habitat: 0, science: 0, status: 'active', reports: [],
    history: [{ turn: 1, text: 'Utility package U-01 begins its final cruise watch. Last routine service is recorded; internal condition has not been inspected.',
      truth: `Starting wear: ${SYSTEMS.map(id => `${SYSTEM_NAMES[id]} ${systems[id].wear}/9`).join('; ')}.` }],
  };
}

function copy(state: EngineeringState): EngineeringState {
  return { ...state, systems: Object.fromEntries(SYSTEMS.map(id => [id, { ...state.systems[id] }])) as EngineeringState['systems'],
    available: { ...state.available }, jobs: [...state.jobs], history: [...state.history], reports: [...state.reports] };
}

function capacities(state: EngineeringState) {
  const s = state.systems;
  return {
    power: Math.max(2, 8 - Math.floor(s.power.wear / 2) - (s.power.repaired ? 2 : 0)),
    cooling: Math.max(2, 8 - Math.floor(s.cooling.wear / 2) - (s.cooling.repaired ? 2 : 0)),
    recycler: Math.max(0, 3 - Math.floor(s.recycler.wear / 3) - Number(s.recycler.repaired)),
  };
}

// Live readings are observations, not an inspection of internal condition. The same
// output shortfall can result from input capacity, protective limiting, or recycler wear.
export function getReadings(state: EngineeringState): Readings {
  const capacity = capacities(state);
  const base = state.turn < 5 ? 2 : 3;
  const requested = base + 3 + state.jobs.length * 2;
  const delivered = Math.min(requested, state.mode === 'protected'
    ? Math.min(capacity.power, capacity.cooling) : capacity.power + 2);
  let remaining = Math.max(0, delivered - base);
  let lifePower = 0;
  if (state.priority === 'life') { lifePower = Math.min(3, remaining); remaining -= lifePower; }
  const jobPower = state.jobs.map(() => { const assigned = Math.min(2, remaining); remaining -= assigned; return assigned; });
  if (state.priority === 'projects') lifePower = Math.min(3, remaining);
  const output = Math.min(lifePower, capacity.recycler);
  const demand = state.turn < 5 ? 2 : 3;
  const reserveNeed = Math.max(0, demand - output);
  const reserveUse = Math.min(state.reserves, reserveNeed);
  return { requested, delivered, thermalStress: Math.max(0, delivered - capacity.cooling),
    output, demand, reserveUse, unmetDemand: reserveNeed - reserveUse, jobPower };
}

export function setOperation(state: EngineeringState, mode: EngineeringState['mode'], priority: EngineeringState['priority']): EngineeringState {
  if (state.status !== 'active' || !['protected', 'override'].includes(mode) || !['life', 'projects'].includes(priority)
    || (state.mode === mode && state.priority === priority)) return state;
  return { ...state, mode, priority };
}

export function actionUnavailable(state: EngineeringState, crew: CrewId, action: EngineeringAction): string | null {
  if (state.status !== 'active') return 'The experiment has ended.';
  if (!state.available[crew]) return 'This crew member is already assigned.';
  if (['fabricate', 'commission', 'science'].includes(action)) {
    if (state.jobs.some(job => job.kind === action)) return 'Already scheduled this watch.';
    if (action === 'fabricate' && !state.feedstock) return 'No feedstock remains.';
    if (action === 'commission' && state.turn < 5) return 'Available after arrival, on watch 5.';
    if (action === 'commission' && state.habitat >= 2) return 'The habitat connection is complete.';
    return null;
  }
  const [kind, id] = action.split(':') as [string, SystemId];
  if (!SYSTEMS.includes(id) || !['inspect', 'maintain', 'repair'].includes(kind)) return 'Unknown action.';
  if (kind === 'maintain' && state.systems[id].serviced) return 'Already serviced this watch.';
  if (kind === 'repair' && state.systems[id].repaired) return 'Already repaired this watch.';
  if (kind === 'repair' && !state.spares) return 'No spare parts remain.';
  return null;
}

export function takeEngineeringAction(state: EngineeringState, crew: CrewId, action: EngineeringAction): EngineeringState {
  if (actionUnavailable(state, crew, action)) return state;
  const next = copy(state);
  next.available[crew] = false;
  const person = CREW[crew].name;
  if (['fabricate', 'commission', 'science'].includes(action)) {
    next.jobs.push({ kind: action as Job, crew });
    next.history.push({ turn: state.turn, text: `${person} scheduled ${jobName(action as Job)}. Completion needs 2 power at the end of this watch.` });
    return next;
  }
  const [kind, id] = action.split(':') as [string, SystemId];
  const system = next.systems[id];
  if (kind === 'inspect' || kind === 'repair') {
    const oldWear = system.wear;
    if (kind === 'repair') {
      next.spares--;
      system.wear = Math.max(0, system.wear - (crew === 'engineer' ? 4 : 2));
      system.serviceAge = 0;
      system.repaired = true;
    }
    system.finding = { turn: state.turn, band: wearBand(system.wear), wear: crew === 'engineer' ? system.wear : null };
    const evidence = crew === 'engineer' ? `${system.wear}/9 wear` : `${wearBand(system.wear)} condition (wear ${system.wear < 3 ? '0–2' : system.wear < 6 ? '3–5' : '6–9'})`;
    next.history.push({ turn: state.turn,
      text: `${person} ${kind === 'repair' ? 'repaired' : 'inspected'} ${SYSTEM_NAMES[id]}: confirmed ${evidence}.${kind === 'repair' ? ' Used 1 spare; reduced capacity for this watch while the unit is tested.' : ''}`,
      ...(kind === 'repair' ? { truth: `Repair changed wear from ${oldWear} to ${system.wear}.` } : {}),
    });
  } else {
    const oldWear = system.wear;
    system.serviceAge = 0;
    system.serviced = true;
    system.wear = Math.max(0, system.wear - 1);
    next.history.push({ turn: state.turn, text: `${person} serviced ${SYSTEM_NAMES[id]}. Maintenance clock reset; removed up to 1 wear. This does not inspect internal condition.`,
      truth: `Service changed wear from ${oldWear} to ${system.wear}.` });
  }
  return next;
}

export function jobName(job: Job): string {
  return { fabricate: 'parts fabrication', commission: 'habitat commissioning', science: 'a Europa observation' }[job];
}

export function cancelEngineeringJob(state: EngineeringState, job: Job): EngineeringState {
  const found = state.jobs.find(entry => entry.kind === job);
  if (state.status !== 'active' || !found) return state;
  const next = copy(state);
  next.jobs = next.jobs.filter(entry => entry.kind !== job);
  next.available[found.crew] = true;
  next.history.push({ turn: state.turn, text: `${CREW[found.crew].name} stood down from ${jobName(job)} before the watch ran. Assignment available again.` });
  return next;
}

export function endEngineeringTurn(state: EngineeringState): EngineeringState {
  if (state.status !== 'active') return state;
  const next = copy(state);
  const readings = getReadings(state);
  const capacity = capacities(state);
  const jobs = state.jobs.map((job, i) => ({ kind: job.kind, complete: readings.jobPower[i] === 2 }));
  const constraints: string[] = [];
  if (state.mode === 'protected' && capacity.cooling < Math.min(readings.requested, capacity.power)) constraints.push('Cooling limited the bus.');
  if (readings.requested > capacity.power + (state.mode === 'override' ? 2 : 0)) constraints.push('Power capacity limited the bus.');
  if (readings.delivered > capacity.power) constraints.push('Override exceeded sustainable power output.');
  if (readings.thermalStress) constraints.push('Override exceeded cooling capacity.');
  if (capacity.recycler < readings.demand) constraints.push('Recycler wear or repair testing limited throughput.');
  next.reserves = Math.max(0, next.reserves - readings.reserveUse);
  next.history.push({ turn: state.turn,
    text: `${state.mode === 'protected' ? 'Protected operation' : 'Limits overridden'}, ${state.priority === 'life' ? 'life support' : 'projects'} first. Bus ${readings.delivered}/${readings.requested}; recycler ${readings.output}/${readings.demand} needed. ${readings.reserveUse ? `Consumed ${readings.reserveUse} reserve supplies.` : 'Held reserve supplies.'}${readings.unmetDemand ? ` Stores could not cover ${readings.unmetDemand} additional supply demand.` : ''}`,
    truth: `Available power ${capacity.power}; cooling capacity ${capacity.cooling}; recycler capacity ${capacity.recycler}. ${constraints.join(' ') || 'Equipment capacity met the requested load.'}` });
  jobs.forEach((job, i) => {
    if (job.complete) {
      if (job.kind === 'fabricate') { next.feedstock--; next.spares += 2; }
      if (job.kind === 'commission') next.habitat++;
      if (job.kind === 'science') next.science++;
    }
    next.history.push({ turn: state.turn, text: `${CREW[state.jobs[i].crew].name}: ${jobName(job.kind)} ${job.complete ? 'completed' : `stalled (${readings.jobPower[i]}/2 power)`}.${job.complete && job.kind === 'fabricate' ? ' Used 1 feedstock; produced 2 spares.' : !job.complete ? ' Assignment spent; no material consumed. Reschedule to try again.' : ''}` });
  });
  for (const id of SYSTEMS) {
    const system = next.systems[id];
    system.serviceAge++;
    const neglect = system.serviceAge >= 3 ? 1 : 0;
    const stress = (id === 'power' && readings.delivered > capacity.power) || (id === 'cooling' && readings.thermalStress > 0) ? 1 : 0;
    const oldWear = system.wear;
    system.wear = Math.min(9, system.wear + neglect + stress);
    if (neglect || stress) next.history.push({ turn: state.turn,
      text: `${SYSTEM_NAMES[id]}: ${[neglect ? 'service overdue' : '', stress ? 'operating limit exceeded' : ''].filter(Boolean).join('; ')}. Continued operation adds wear.`,
      truth: `Wear ${oldWear} → ${system.wear} (${neglect} from overdue maintenance, ${stress} from overload).` });
  }
  next.reports.push({ ...readings, turn: state.turn, mode: state.mode, priority: state.priority, jobs,
    wear: Object.fromEntries(SYSTEMS.map(id => [id, next.systems[id].wear])) as Record<SystemId, number> });
  if (!next.reserves) next.status = 'failed';
  else if (state.turn === 8) next.status = next.habitat === 2 && readings.output >= readings.demand ? 'viable' : 'failed';
  if (next.status !== 'active') {
    next.history.push({ turn: state.turn, text: !next.reserves ? 'Reserve supplies exhausted. The utility trial ends.'
      : next.status === 'viable' ? 'Habitat connection complete; life support met demand during the final watch. The foothold is viable.'
        : 'Trial ended without both a completed habitat connection and life support meeting final-watch demand.' });
    return next;
  }
  next.turn++;
  next.available = { engineer: true, operator: true };
  next.jobs = [];
  for (const id of SYSTEMS) { next.systems[id].serviced = false; next.systems[id].repaired = false; }
  if (next.turn === 5) next.history.push({ turn: 5, text: 'Arrived at Callisto. U-01 now supports the surface habitat: base demand rises from 2 to 3 power, and required recycling from 2 to 3. Equipment, crew, supplies, and records carry forward.' });
  return next;
}

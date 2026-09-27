import { getManifest, ownedCards, cardById } from './engine.ts';
import type { CargoFamily, GameState } from './types.ts';

export interface ColonyIssue { id: string; name: string; week: number; family: CargoFamily }
export interface ColonyState {
  week: number;
  teams: number;
  power: number;
  reserves: number;
  shelter: number;
  recycler: number;
  science: number;
  observedThisWeek: boolean;
  cargo: Record<CargoFamily, number>;
  issues: ColonyIssue[];
  history: string[];
  status: 'active' | 'viable' | 'failed';
}

const ISSUES: ColonyIssue[] = [
  { id: 'airlock', name: 'Airlock seal', week: 2, family: 'industry' },
  { id: 'contamination', name: 'Recycler contamination', week: 3, family: 'industry' },
  { id: 'medical', name: 'Medical follow-up', week: 4, family: 'habitat' },
  { id: 'thermal', name: 'Thermal control', week: 5, family: 'industry' },
  { id: 'fatigue', name: 'Crew fatigue', week: 6, family: 'habitat' },
];

export function startColony(voyage: GameState): ColonyState {
  if (voyage.phase !== 'arrived') throw new Error('The expedition must reach Callisto first.');
  const manifest = getManifest(voyage);
  const cargo = Object.fromEntries(manifest.map(f => [f.id, f.count])) as Record<CargoFamily, number>;
  const burdens = ownedCards(voyage).filter(c => cardById(c.id).type === 'Burden').length;
  const reserves = Math.max(3, 5 + Math.min(2, Math.floor(manifest.reduce((n, f) => n + f.count, 0) / 5)) - Math.min(2, Math.floor(burdens / 3)));
  return {
    week: 1, teams: 2, power: 3, reserves, shelter: 0, recycler: 0, science: 0, observedThisWeek: false, cargo,
    issues: burdens ? [{ id: 'strain', name: 'Crew strain from the crossing', week: 1, family: 'habitat' }] : [],
    history: [`Arrived with ${reserves} ship-support reserves, ${burdens} unresolved Burdens, and ${manifest.reduce((n, f) => n + f.count, 0)} Cargo kits.`],
    status: 'active',
  };
}

export type ColonyAction = 'shelter' | 'recycler' | 'science' | `fix:${string}`;

export function actionCost(state: ColonyState, action: ColonyAction): { teams: number; power: number } | null {
  if (state.status !== 'active') return null;
  if (action === 'shelter' && state.shelter < 2) return { teams: state.cargo.habitat ? 1 : 2, power: 1 };
  if (action === 'recycler' && state.recycler < 2) return { teams: state.cargo.industry ? 1 : 2, power: 2 };
  if (action === 'science' && state.week >= 3 && !state.observedThisWeek && state.science < 4 && state.cargo.science) return { teams: 1, power: 2 };
  if (action.startsWith('fix:') && state.issues.some(issue => issue.id === action.slice(4))) return { teams: 1, power: 1 };
  return null;
}

export function takeColonyAction(state: ColonyState, action: ColonyAction): ColonyState {
  const cost = actionCost(state, action);
  if (!cost || cost.teams > state.teams || cost.power > state.power) return state;
  const next = { ...state, teams: state.teams - cost.teams, power: state.power - cost.power, issues: [...state.issues], history: [...state.history] };
  if (action === 'shelter') { next.shelter++; next.history.push(`Week ${next.week}: Commissioned Shelter ${next.shelter}/2.`); }
  else if (action === 'recycler') { next.recycler++; next.history.push(`Week ${next.week}: Commissioned Recycler ${next.recycler}/2.`); }
  else if (action === 'science') { next.science++; next.observedThisWeek = true; next.history.push(`Week ${next.week}: Collected Europa data ${next.science}/4.`); }
  else {
    const issue = next.issues.find(i => i.id === action.slice(4))!;
    next.issues = next.issues.filter(i => i.id !== issue.id);
    next.history.push(`Week ${next.week}: Resolved ${issue.name}.`);
  }
  return next;
}

export function endColonyWeek(state: ColonyState): ColonyState {
  if (state.status !== 'active') return state;
  const incomplete = state.shelter < 2 || state.recycler < 2;
  const overdue = state.issues.filter(issue => issue.week < state.week).length;
  const loss = Number(incomplete) + overdue;
  const next: ColonyState = { ...state, reserves: Math.max(0, state.reserves - loss), issues: [...state.issues], history: [...state.history] };
  next.history.push(`Week ${state.week}: ${loss ? `Spent ${loss} reserve${loss === 1 ? '' : 's'}` : 'Held reserves'}${incomplete ? ' while essential systems remained unfinished' : ''}${overdue ? `; ${overdue} unresolved issue${overdue === 1 ? '' : 's'} required support` : ''}.`);
  if (!next.reserves) next.status = 'failed';
  else if (state.week === 6) next.status = next.shelter === 2 && next.recycler === 2 && next.issues.length <= 2 ? 'viable' : 'failed';
  else {
    next.week++;
    next.teams = 2;
    next.power = 3;
    next.observedThisWeek = false;
    const issue = ISSUES.find(i => i.week === next.week);
    if (issue) next.issues.push(issue);
  }
  return next;
}

import { EVENTS, PROJECTS, QUIET_EVENT } from './content.ts';
import type { Choice, Effect, GameState, Project, ProjectId, Stat, Stats, VoyageEvent } from './types.ts';

const STAT_NAMES: Record<Stat, string> = {
  ship: 'Ship', crew: 'Crew', supplies: 'Supplies', readiness: 'Readiness',
};
const BASE_UPKEEP: Partial<Stats> = { ship: -1, crew: -1, supplies: -2 };
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const hasProject = (state: GameState, id: ProjectId) => state.completedProjects.includes(id);

// FNV-1a seeds a tiny Mulberry32 generator. Only transitions consume randomness.
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function random(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let value = state.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function copy(state: GameState): GameState {
  return {
    ...state,
    stats: { ...state.stats },
    activeProject: state.activeProject ? { ...state.activeProject } : null,
    completedProjects: [...state.completedProjects],
    flags: [...state.flags],
    pending: [...state.pending],
    seenEvents: [...state.seenEvents],
    log: [...state.log],
  };
}

export function createGame(seed: string): GameState {
  return {
    seed, rng: hashSeed(seed), month: 0, phase: 'ready',
    stats: { ship: 86, crew: 84, supplies: 86, readiness: 12 },
    activeProject: null, completedProjects: [], science: 0, flags: [],
    pending: [], seenEvents: [], currentEventId: null, log: [],
  };
}

export function projectById(id: ProjectId): Project {
  const project = PROJECTS.find((entry) => entry.id === id);
  if (!project) throw new Error(`Unknown project: ${id}`);
  return project;
}

export function getCurrentEvent(state: GameState): VoyageEvent | null {
  if (state.phase !== 'decision') return null;
  if (state.currentEventId === QUIET_EVENT.id) return QUIET_EVENT;
  return EVENTS.find((event) => event.id === state.currentEventId) ?? null;
}

function adjustedStats(stats: Partial<Stats>, state?: GameState, category = ''): Partial<Stats> {
  const adjusted: Partial<Stats> = {};
  for (const stat of Object.keys(stats) as Stat[]) {
    let delta = stats[stat] ?? 0;
    if (state && delta < 0) {
      if (stat === 'ship' && hasProject(state, 'fabrication')) delta = Math.min(0, delta + 2);
      if (stat === 'crew') {
        if (category === 'radiation' && hasProject(state, 'radiation')) delta = Math.ceil(delta / 2);
        if (category !== 'radiation' && hasProject(state, 'training')) delta = Math.min(0, delta + 2);
      }
    }
    if (delta !== 0) adjusted[stat] = delta;
  }
  return adjusted;
}

export function monthlyUpkeep(state: GameState): Partial<Stats> {
  return adjustedStats({ ...BASE_UPKEEP, supplies: hasProject(state, 'agriculture') ? -1 : -2 }, state);
}

function applyStats(state: GameState, deltas: Partial<Stats>): Partial<Stats> {
  const changes: Partial<Stats> = {};
  for (const stat of Object.keys(deltas) as Stat[]) {
    const before = state.stats[stat];
    state.stats[stat] = clamp(before + (deltas[stat] ?? 0));
    const actual = state.stats[stat] - before;
    if (actual !== 0) changes[stat] = actual;
  }
  return changes;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function describeEffect(effect: Effect, state?: GameState, category = ''): string[] {
  const stats = adjustedStats(effect.stats ?? {}, state, category);
  const description = (Object.keys(stats) as Stat[]).map((stat) => `${STAT_NAMES[stat]} ${signed(stats[stat]!)}`);
  if (effect.science) description.push(`Europa science ${signed(effect.science)}`);
  if (effect.delay) description.push(`Project pauses ${effect.delay} ${effect.delay === 1 ? 'month' : 'months'}`);
  if (effect.followUp) {
    const { chance = 1, afterMonths } = effect.followUp;
    description.push(`${chance < 1 ? `${Math.round(chance * 100)}% chance of a follow-up` : 'Follow-up'} in ${afterMonths} months`);
  }
  return description;
}

// Called only on a private transition copy. Log deltas reflect bounds and perks.
function applyEffect(state: GameState, effect: Effect, category = ''): { changes: Partial<Stats>; notes: string[] } {
  const changes = applyStats(state, adjustedStats(effect.stats ?? {}, state, category));
  const notes: string[] = [];
  if (effect.science) {
    const before = state.science;
    state.science = clamp(state.science + effect.science);
    if (state.science !== before) notes.push(`Europa science ${signed(state.science - before)}.`);
  }
  if (effect.delay && state.activeProject) {
    state.activeProject.delay += effect.delay;
    notes.push(`Project work pauses for ${effect.delay} ${effect.delay === 1 ? 'month' : 'months'}.`);
  }
  if (effect.addFlag && !state.flags.includes(effect.addFlag)) state.flags.push(effect.addFlag);
  if (effect.removeFlag) state.flags = state.flags.filter((flag) => flag !== effect.removeFlag);
  if (effect.followUp) {
    const { eventId, afterMonths, chance = 1 } = effect.followUp;
    if (chance >= 1 || random(state) < chance) {
      state.pending.push({ dueMonth: state.month + afterMonths, eventId });
      state.pending.sort((first, second) => first.dueMonth - second.dueMonth);
    }
  }
  return { changes, notes };
}

export function availableChoices(state: GameState): Choice[] {
  const event = getCurrentEvent(state);
  if (!event) return [];
  return event.choices.filter((choice) => {
    if (choice.requiresProject && !hasProject(state, choice.requiresProject)) return false;
    if (choice.requiresActiveProject && !state.activeProject) return false;
    if (choice.requiresFlag && !state.flags.includes(choice.requiresFlag)) return false;
    const cost = adjustedStats(choice.effect.stats ?? {}, state, event.category).supplies ?? 0;
    return cost >= 0 || state.stats.supplies >= -cost;
  });
}

function checkFailure(state: GameState): boolean {
  if (state.stats.ship > 0 && state.stats.crew > 0 && state.stats.supplies > 0) return false;
  state.phase = 'failed';
  state.currentEventId = null;
  return true;
}

export function startProject(state: GameState, id: ProjectId): GameState {
  const project = PROJECTS.find((entry) => entry.id === id);
  if (state.phase !== 'ready' || state.month >= 24 || state.activeProject || hasProject(state, id) || !project) return state;
  const next = copy(state);
  next.activeProject = { id, progress: 0, delay: 0 };
  next.log.push({ month: next.month, kind: 'project', title: `Started ${project.name}`, text: project.description });
  return next;
}

function advanceProject(state: GameState): void {
  if (!state.activeProject) return;
  const active = state.activeProject;
  const project = projectById(active.id);
  if (active.delay > 0) {
    active.delay--;
    state.log.push({ month: state.month, kind: 'project', title: `${project.name} paused`, text: 'The team attends to earlier commitments. No project progress this month.' });
    return;
  }
  active.progress++;
  if (active.progress < project.duration) return;
  state.completedProjects.push(active.id);
  state.activeProject = null;
  const { changes, notes } = applyEffect(state, project.completion);
  state.log.push({ month: state.month, kind: 'project', title: `Completed ${project.name}`, text: [project.benefit, ...notes].join(' '), changes });
}

function selectEvent(state: GameState): VoyageEvent {
  // Due consequences take the single decision slot; a collision waits a month.
  state.pending.sort((first, second) => first.dueMonth - second.dueMonth);
  while (state.pending.length && state.pending[0].dueMonth <= state.month) {
    const pending = state.pending.shift()!;
    const event = EVENTS.find((entry) => entry.id === pending.eventId);
    if (!event || (event.requiresFlag && !state.flags.includes(event.requiresFlag))) continue;
    state.log.push({ month: state.month, kind: 'consequence', title: event.title, text: 'An earlier decision has caught up with the expedition.' });
    return event;
  }
  const eligible = EVENTS.filter((event) => !event.followUpOnly
    && !state.seenEvents.includes(event.id)
    && state.month >= (event.minMonth ?? 1)
    && state.month <= (event.maxMonth ?? 24)
    && (!event.requiresFlag || state.flags.includes(event.requiresFlag)));
  if (!eligible.length || random(state) >= 0.7) return QUIET_EVENT;
  let remaining = random(state) * eligible.reduce((sum, event) => sum + (event.weight ?? 1), 0);
  for (const event of eligible) {
    remaining -= event.weight ?? 1;
    if (remaining < 0) return event;
  }
  return eligible[eligible.length - 1];
}

export function advanceMonth(state: GameState): GameState {
  if (state.phase !== 'ready' || state.month >= 24) return state;
  const next = copy(state);
  next.month++;
  const changes = applyStats(next, monthlyUpkeep(next));
  let scienceNote = '';
  if (hasProject(next, 'europa')) {
    const before = next.science;
    next.science = clamp(next.science + 1);
    if (next.science !== before) scienceNote = ` Europa science ${signed(next.science - before)}.`;
  }
  next.log.push({ month: next.month, kind: 'routine', title: 'Cruise operations', text: `Another month of maintenance, exercise, and life support.${scienceNote}`, changes });
  if (checkFailure(next)) return next;
  advanceProject(next);
  if (checkFailure(next)) return next;
  const event = selectEvent(next);
  next.currentEventId = event.id;
  if (event.id !== QUIET_EVENT.id && !next.seenEvents.includes(event.id)) next.seenEvents.push(event.id);
  next.phase = 'decision';
  return next;
}

export function choose(state: GameState, choiceId: string): GameState {
  const event = getCurrentEvent(state);
  const choice = availableChoices(state).find((entry) => entry.id === choiceId);
  if (!event || !choice) return state;
  const next = copy(state);
  const { changes, notes } = applyEffect(next, choice.effect, event.category);
  const outcome = [choice.outcome, ...notes].join(' ');
  next.log.push({ month: next.month, kind: 'choice', title: `${event.title}: ${choice.label}`, text: outcome, changes });
  if (event.followUpOnly) {
    const index = next.log.findIndex((entry) => entry.kind === 'consequence' && entry.month === next.month && entry.title === event.title);
    if (index >= 0) next.log[index] = { ...next.log[index], text: outcome, changes };
  }
  next.currentEventId = null;
  if (!checkFailure(next)) next.phase = next.month >= 24 ? 'arrived' : 'ready';
  return next;
}

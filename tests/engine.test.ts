import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECTS, EVENTS, QUIET_EVENT } from '../src/content.ts';
import {
  advanceMonth,
  availableChoices,
  choose,
  createGame,
  describeEffect,
  getCurrentEvent,
  monthlyUpkeep,
  startProject,
} from '../src/engine.ts';
import type { Choice, GameState, ProjectId, Stats, VoyageEvent } from '../src/types.ts';

const fullStats: Stats = { ship: 100, crew: 100, supplies: 100, readiness: 100 };
const allEvents = [...EVENTS, QUIET_EVENT];

function decision(event: VoyageEvent, overrides: Partial<GameState> = {}): GameState {
  return {
    ...createGame('test-fixture'),
    month: 3,
    phase: 'decision',
    stats: { ...fullStats },
    currentEventId: event.id,
    flags: event.requiresFlag ? [event.requiresFlag] : [],
    ...overrides,
  };
}

function readyAgain(state: GameState): GameState {
  return { ...state, phase: 'ready', currentEventId: null, stats: { ...fullStats } };
}

function effectChoice(predicate: (choice: Choice, event: VoyageEvent) => boolean) {
  for (const event of allEvents) {
    for (const choice of event.choices) {
      if (predicate(choice, event)) return { event, choice };
    }
  }
  assert.fail('The event catalogue needs a choice exercising this mechanic.');
}

function unlockedDecision(event: VoyageEvent, choice: Choice): GameState {
  return decision(event, {
    completedProjects: choice.requiresProject ? [choice.requiresProject] : [],
    activeProject: choice.requiresActiveProject
      ? { id: 'agriculture', progress: 0, delay: 0 }
      : null,
    flags: [...new Set([event.requiresFlag, choice.requiresFlag].filter(Boolean))] as string[],
  });
}

function simulate(seed: string, protectStats = false, score?: (state: GameState, choice: Choice) => number) {
  let state = createGame(seed);
  const route: string[] = [];
  const order: ProjectId[] = ['agriculture', 'fabrication', 'training', 'radiation', 'europa'];
  for (let turn = 0; turn < 24 && state.phase === 'ready'; turn += 1) {
    if (protectStats) state = { ...state, stats: { ...fullStats } };
    const nextProject = order.find((id) => !state.completedProjects.includes(id));
    if (!state.activeProject && nextProject) state = startProject(state, nextProject);
    state = advanceMonth(state);
    if (state.phase !== 'decision') break;
    const event = getCurrentEvent(state);
    assert.ok(event);
    route.push(event.id);
    const choices = availableChoices(state);
    assert.ok(choices.length > 0, `No choice available in ${event.id}`);
    const selected = score
      ? choices.reduce((best, choice) => score(state, choice) > score(state, best) ? choice : best)
      : choices[0];
    state = choose(state, selected.id);
    for (const value of Object.values(state.stats)) assert.ok(value >= 0 && value <= 100);
  }
  return { state, route };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('content has five projects, a small unique event catalogue, and valid references', () => {
  assert.equal(PROJECTS.length, 5);
  assert.ok(EVENTS.length >= 10 && EVENTS.length <= 15);
  assert.equal(new Set(PROJECTS.map((project) => project.id)).size, PROJECTS.length);
  assert.equal(new Set(allEvents.map((event) => event.id)).size, allEvents.length);
  const projectIds = new Set(PROJECTS.map((project) => project.id));
  const eventIds = new Set(EVENTS.map((event) => event.id));
  for (const project of PROJECTS) assert.ok(project.duration >= 2 && project.duration < 24);
  for (const event of allEvents) {
    assert.ok(event.choices.length >= 1);
    assert.equal(new Set(event.choices.map((choice) => choice.id)).size, event.choices.length);
    for (const choice of event.choices) {
      if (choice.requiresProject) assert.ok(projectIds.has(choice.requiresProject));
      if (choice.effect.followUp) assert.ok(eventIds.has(choice.effect.followUp.eventId));
    }
  }
});

test('the same seed and decisions reproduce the entire voyage', () => {
  assert.deepEqual(simulate('europa-lives'), simulate('europa-lives'));
});

test('different seeds create different event routes', () => {
  const routes = new Set(Array.from({ length: 12 }, (_, index) =>
    simulate(`route-${index}`, true).route.join(',')));
  assert.ok(routes.size > 1);
});

test('actions enforce phases and reject nonexistent choices and projects', () => {
  const initial = createGame('guards');
  assert.equal(initial.month, 0);
  assert.equal(initial.phase, 'ready');
  assert.equal(choose(initial, 'missing'), initial);
  assert.equal(startProject(initial, 'missing' as ProjectId), initial);
  const pending = advanceMonth(initial);
  assert.equal(pending.phase, 'decision');
  assert.equal(advanceMonth(pending), pending);
  assert.equal(startProject(pending, 'agriculture'), pending);
  assert.equal(choose(pending, 'missing'), pending);
  for (const phase of ['arrived', 'failed'] as const) {
    const terminal = { ...initial, phase };
    assert.equal(advanceMonth(terminal), terminal);
    assert.equal(startProject(terminal, 'agriculture'), terminal);
    assert.equal(choose(terminal, 'missing'), terminal);
  }
});

test('transitions do not mutate their input, including nested state', () => {
  const initial = deepFreeze(createGame('immutable'));
  const original = structuredClone(initial);
  const project = deepFreeze(startProject(initial, 'agriculture'));
  const started = structuredClone(project);
  const monthly = deepFreeze(advanceMonth(project));
  const advanced = structuredClone(monthly);
  const result = choose(monthly, availableChoices(monthly)[0].id);
  assert.deepEqual(initial, original);
  assert.deepEqual(project, started);
  assert.deepEqual(monthly, advanced);
  assert.notEqual(result, monthly);
});

test('only one project runs at a time and it completes without repeated planning', () => {
  const project = PROJECTS[0];
  let state = startProject(createGame('automatic'), project.id);
  assert.equal(startProject(state, PROJECTS[1].id), state);
  for (let month = 1; month <= project.duration; month += 1) {
    state = advanceMonth(state);
    if (month < project.duration) assert.equal(state.activeProject?.progress, month);
    state = readyAgain(state);
  }
  assert.equal(state.activeProject, null);
  assert.deepEqual(state.completedProjects, [project.id]);
  assert.equal(startProject(state, project.id), state);
  assert.ok(startProject(state, PROJECTS[1].id).activeProject);
});

test('project delays skip exactly the specified number of future work ticks', () => {
  const { event, choice } = effectChoice((option) => (option.effect.delay ?? 0) > 0);
  let state = unlockedDecision(event, choice);
  state.activeProject = { id: 'agriculture', progress: 0, delay: 0 };
  state = choose(state, choice.id);
  const delay = choice.effect.delay!;
  assert.equal(state.activeProject?.delay, delay);
  for (let month = 0; month < delay; month += 1) {
    state = advanceMonth(state);
    assert.equal(state.activeProject?.progress, 0);
    state = readyAgain(state);
  }
  state = advanceMonth(state);
  assert.equal(state.activeProject?.progress, 1);
});

test('supply costs cannot be paid with supplies the expedition does not have', () => {
  const { event, choice } = effectChoice((option) => (option.effect.stats?.supplies ?? 0) < 0);
  const cost = -choice.effect.stats!.supplies!;
  const state = unlockedDecision(event, choice);
  state.stats.supplies = cost - 1;
  assert.ok(!availableChoices(state).some((option) => option.id === choice.id));
  assert.equal(choose(state, choice.id), state);
  const exact = { ...state, stats: { ...state.stats, supplies: cost } };
  assert.ok(availableChoices(exact).some((option) => option.id === choice.id));
  const result = choose(exact, choice.id);
  assert.equal(result.stats.supplies, 0);
  assert.equal(result.phase, 'failed');
});

test('every event retains a playable choice when supplies are scarce and no project is active', () => {
  for (const event of allEvents) {
    const state = decision(event, { stats: { ...fullStats, supplies: 1 } });
    assert.ok(availableChoices(state).length > 0, `${event.id} leaves the player stuck`);
  }
});

test('ordinary events do not repeat within a voyage', () => {
  for (let index = 0; index < 12; index += 1) {
    const { route } = simulate(`no-repeat-${index}`, true);
    const ordinary = route.filter((id) => EVENTS.some((event) => event.id === id && !event.followUpOnly));
    assert.equal(new Set(ordinary).size, ordinary.length);
  }
});

test('a surviving voyage ends after the month 24 decision', () => {
  const { state, route } = simulate('arrival', true);
  assert.equal(state.month, 24);
  assert.equal(route.length, 24);
  assert.equal(state.phase, 'arrived');
  assert.equal(getCurrentEvent(state), null);
  assert.equal(advanceMonth(state), state);
});

test('natural-resource voyages can arrive and produce distinct outcomes without deadlocks', () => {
  // This small captain policy preserves scarce resources, then favors arrival preparation.
  // Unlike isolated boundary tests, it never replenishes the simulated expedition.
  const score = (state: GameState, choice: Choice) =>
    Object.entries(choice.effect.stats ?? {}).reduce((total, [stat, delta]) =>
      total + delta * (stat === 'readiness' ? 1 : state.stats[stat as keyof Stats] < 35 ? 3 : 0.35), 0)
    + (choice.effect.science ?? 0) * 0.6 - (choice.effect.delay ?? 0) * 2;
  const runs = Array.from({ length: 20 }, (_, index) => simulate(`natural-${index}`, false, score));
  assert.ok(runs.some(({ state }) => state.phase === 'arrived'), 'At least one unassisted voyage must reach Jupiter');
  for (const { state } of runs) {
    assert.ok(state.phase === 'arrived' || state.phase === 'failed');
    assert.ok(state.month > 0 && state.month <= 24);
    if (state.phase === 'arrived') assert.equal(state.month, 24);
    for (const value of Object.values(state.stats)) assert.ok(value >= 0 && value <= 100);
  }
  assert.ok(new Set(runs.map(({ state }) => JSON.stringify([state.stats, state.science]))).size > 1);
  assert.deepEqual(runs[0], simulate('natural-0', false, score));
});

test('ship, crew and supplies reaching zero fail the voyage; readiness does not', () => {
  for (const stat of ['ship', 'crew', 'supplies'] as const) {
    const state = createGame(`empty-${stat}`);
    state.stats[stat] = 0;
    assert.equal(advanceMonth(state).phase, 'failed', stat);
  }
  const state = createGame('unprepared');
  state.stats.readiness = 0;
  assert.equal(advanceMonth(state).phase, 'decision');
});

test('completed projects reduce the corresponding recurring upkeep', () => {
  const baseline = createGame('upkeep');
  const ordinary = monthlyUpkeep(baseline);
  const agriculture = monthlyUpkeep({ ...baseline, completedProjects: ['agriculture'] });
  const fabrication = monthlyUpkeep({ ...baseline, completedProjects: ['fabrication'] });
  assert.ok((agriculture.supplies ?? 0) > (ordinary.supplies ?? 0));
  assert.ok((fabrication.ship ?? 0) > (ordinary.ship ?? 0));
});

test('positive rewards clamp the four condition meters at 100', () => {
  const { event, choice } = effectChoice((option) =>
    Object.values(option.effect.stats ?? {}).some((value) => value > 0));
  const state = unlockedDecision(event, choice);
  const result = choose(state, choice.id);
  for (const [stat, delta] of Object.entries(choice.effect.stats ?? {})) {
    if (delta > 0) assert.equal(result.stats[stat as keyof Stats], 100);
  }
  for (const value of Object.values(result.stats)) assert.ok(value >= 0 && value <= 100);
});

test('project-specific choices stay locked until the required project is complete', () => {
  const { event, choice } = effectChoice((option) => Boolean(option.requiresProject));
  const state = unlockedDecision(event, choice);
  state.completedProjects = [];
  assert.ok(!availableChoices(state).some((option) => option.id === choice.id));
  assert.equal(choose(state, choice.id), state);
  const complete = { ...state, completedProjects: [choice.requiresProject!] };
  assert.ok(availableChoices(complete).some((option) => option.id === choice.id));
});

test('scheduled consequences arrive at their due month and take the decision slot', () => {
  const consequence = EVENTS.find((event) => event.followUpOnly);
  assert.ok(consequence);
  let state = {
    ...createGame('due-consequence'),
    flags: consequence.requiresFlag ? [consequence.requiresFlag] : [],
    pending: [{ dueMonth: 3, eventId: consequence.id }],
  };
  for (let month = 1; month <= 3; month += 1) {
    state = advanceMonth(state);
    assert.equal(state.month, month);
    if (month < 3) {
      assert.notEqual(getCurrentEvent(state)?.id, consequence.id);
      assert.equal(state.pending.length, 1);
      state = readyAgain(state);
    } else {
      assert.equal(getCurrentEvent(state)?.id, consequence.id);
      assert.equal(state.pending.length, 0);
    }
  }
  const option = availableChoices(state)[0];
  const originalConsequence = state.log.find((entry) => entry.kind === 'consequence');
  const resolved = choose(state, option.id);
  const recorded = resolved.log.find((entry) => entry.kind === 'consequence');
  assert.ok(recorded?.text.includes(option.outcome));
  assert.notEqual(recorded, originalConsequence);
  assert.ok(!originalConsequence?.text.includes(option.outcome));
});

test('colliding consequences remain queued for the next available monthly decision', () => {
  const consequences = EVENTS.filter((event) => event.followUpOnly).slice(0, 2);
  assert.equal(consequences.length, 2);
  const state = {
    ...createGame('collision'),
    flags: consequences.flatMap((event) => event.requiresFlag ? [event.requiresFlag] : []),
    pending: consequences.map((event) => ({ dueMonth: 1, eventId: event.id })),
  };
  const first = advanceMonth(state);
  assert.equal(getCurrentEvent(first)?.id, consequences[0].id);
  assert.deepEqual(first.pending, [{ dueMonth: 1, eventId: consequences[1].id }]);
  const second = advanceMonth(readyAgain(first));
  assert.equal(getCurrentEvent(second)?.id, consequences[1].id);
  assert.equal(second.pending.length, 0);
  assert.equal(state.pending.length, 2);
});

test('earlier choices schedule later consequences relative to the decision month', () => {
  const { event, choice } = effectChoice((option) =>
    Boolean(option.effect.followUp && (option.effect.followUp.chance ?? 1) > 0));
  const followUp = choice.effect.followUp!;
  let scheduled: GameState | undefined;
  for (let attempt = 0; attempt < 100 && !scheduled; attempt += 1) {
    const state = unlockedDecision(event, choice);
    state.rng = createGame(`consequence-${attempt}`).rng;
    const result = choose(state, choice.id);
    if (result.pending.length) scheduled = result;
  }
  assert.ok(scheduled, 'A consequence with a positive probability should be schedulable');
  assert.deepEqual(scheduled.pending, [{ dueMonth: 3 + followUp.afterMonths, eventId: followUp.eventId }]);
});

test('shielding reduces radiation harm while cross-training protects ordinary crew losses', () => {
  const { event, choice } = effectChoice((option, entry) =>
    entry.category === 'radiation' && (option.effect.stats?.crew ?? 0) < -2);
  const state = unlockedDecision(event, choice);
  state.completedProjects = [];
  const delta = choice.effect.stats!.crew!;
  const unprotected = choose(state, choice.id);
  const trained = choose({ ...state, completedProjects: ['training'] }, choice.id);
  const shielded = choose({ ...state, completedProjects: ['radiation'] }, choice.id);
  const prepared = choose({ ...state, completedProjects: ['radiation', 'training'] }, choice.id);
  assert.equal(unprotected.stats.crew, 100 + delta);
  assert.equal(trained.stats.crew, unprotected.stats.crew);
  assert.equal(shielded.stats.crew, 100 + Math.ceil(delta / 2));
  assert.equal(prepared.stats.crew, shielded.stats.crew);

  const ordinary = effectChoice((option, entry) =>
    entry.category !== 'radiation' && !option.requiresProject && (option.effect.stats?.crew ?? 0) < -2);
  const ordinaryState = unlockedDecision(ordinary.event, ordinary.choice);
  const ordinaryDelta = ordinary.choice.effect.stats!.crew!;
  const ordinaryTrained = choose({ ...ordinaryState, completedProjects: ['training'] }, ordinary.choice.id);
  const ordinaryShielded = choose({ ...ordinaryState, completedProjects: ['radiation'] }, ordinary.choice.id);
  assert.equal(ordinaryTrained.stats.crew, 100 + Math.min(0, ordinaryDelta + 2));
  assert.equal(ordinaryShielded.stats.crew, 100 + ordinaryDelta);
});

test('quiet-month effect labels report the actual rewards and project-adjusted costs', () => {
  const names = { ship: 'Ship', crew: 'Crew', supplies: 'Supplies', readiness: 'Readiness' };
  for (const completedProjects of [[], ['training', 'fabrication']] as ProjectId[][]) {
    const state = decision(QUIET_EVENT, {
      completedProjects,
      stats: { ship: 50, crew: 50, supplies: 50, readiness: 50 },
    });
    for (const choice of availableChoices(state)) {
      const result = choose(state, choice.id);
      const expected = (Object.keys(names) as (keyof Stats)[]).flatMap((stat) => {
        const delta = result.stats[stat] - state.stats[stat];
        return delta ? [`${names[stat]} ${delta > 0 ? '+' : ''}${delta}`] : [];
      });
      assert.deepEqual(describeEffect(choice.effect, state, QUIET_EVENT.category).sort(), expected.sort());
    }
  }
});

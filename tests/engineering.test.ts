import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CASES, SYSTEMS, actionUnavailable, cancelEngineeringJob, createEngineering, endEngineeringTurn,
  getReadings, setOperation, takeEngineeringAction,
} from '../src/engineering.ts';
import type { CaseId, CrewId, EngineeringAction, EngineeringState } from '../src/engineering.ts';

function act(state: EngineeringState, crew: CrewId, action: EngineeringAction) {
  assert.equal(actionUnavailable(state, crew, action), null, `${crew}: ${action}`);
  return takeEngineeringAction(state, crew, action);
}

test('inspection produces reliable evidence without changing equipment; expertise determines precision', () => {
  const initial = createEngineering();
  const before = structuredClone(initial);
  const precise = act(initial, 'engineer', 'inspect:cooling');
  assert.deepEqual(precise.systems.cooling.finding, { turn: 1, band: 'worn', wear: 5 });
  const broad = act(initial, 'operator', 'inspect:cooling');
  assert.deepEqual(broad.systems.cooling.finding, { turn: 1, band: 'worn', wear: null });
  assert.equal(precise.systems.cooling.wear, initial.systems.cooling.wear);
  assert.deepEqual(initial, before, 'Transitions must not mutate the original or its nested state');
  assert.equal(takeEngineeringAction(precise, 'engineer', 'science'), precise);
});

test('power and cooling faults can both starve fabrication; repairs act on their actual target', () => {
  for (const caseId of ['WAKE-01', 'WAKE-02'] as CaseId[]) {
    const initial = createEngineering(caseId);
    const queued = act(initial, 'operator', 'fabricate');
    assert.equal(getReadings(queued).delivered, 6);
    assert.deepEqual(getReadings(queued).jobPower, [1]);
    const stalled = endEngineeringTurn(queued);
    assert.equal(stalled.spares, 2);
    assert.equal(stalled.feedstock, 2, 'Unfinished fabrication must not consume stock');
    const target = caseId === 'WAKE-01' ? 'cooling' : 'power';
    const repaired = endEngineeringTurn(act(initial, 'engineer', `repair:${target}`));
    const productive = endEngineeringTurn(act(repaired, 'operator', 'fabricate'));
    assert.equal(productive.feedstock, 1);
    assert.equal(productive.spares, 3);
  }
  const wrong = endEngineeringTurn(act(createEngineering(), 'engineer', 'repair:power'));
  assert.deepEqual(getReadings(act(wrong, 'operator', 'science')).jobPower, [1]);
});

test('priority trades project progress against supplies; override buys capacity with lasting wear', () => {
  const queued = act(createEngineering(), 'operator', 'science');
  const protectedRun = endEngineeringTurn(queued);
  assert.equal(protectedRun.science, 0);
  const prioritized = endEngineeringTurn(setOperation(queued, 'protected', 'projects'));
  assert.equal(prioritized.science, 1);
  // Cruise demand is only 2: redirecting the spare third recycling unit is a valid workaround.
  assert.equal(prioritized.reserves, 7);
  const surface = { ...queued, turn: 5 };
  const surfacePriority = endEngineeringTurn(setOperation(surface, 'protected', 'projects'));
  assert.equal(surfacePriority.reserves, 5);
  const override = endEngineeringTurn(setOperation(queued, 'override', 'life'));
  assert.equal(override.science, 1);
  assert.equal(override.systems.cooling.wear, queued.systems.cooling.wear + 1);
  assert.equal(protectedRun.systems.cooling.wear, queued.systems.cooling.wear);
});

test('service debt creates cumulative wear and reduces downstream capacity; service interrupts it', () => {
  let neglected = createEngineering('WAKE-04');
  for (let i = 0; i < 5; i++) neglected = endEngineeringTurn(neglected);
  assert.equal(neglected.systems.recycler.wear, 4);
  assert.equal(getReadings(neglected).output, 2);
  const serviced = act(neglected, 'operator', 'maintain:recycler');
  assert.equal(serviced.systems.recycler.serviceAge, 0);
  assert.equal(serviced.systems.recycler.wear, 3);
  const next = endEngineeringTurn(serviced);
  assert.equal(next.systems.recycler.wear, 3, 'Service prevents further overdue wear this watch');
  assert.equal(next.systems.power.wear, 5, 'Ignoring another unit still has consequences');
});

test('repairs consume spares and temporarily reduce capacity without requiring an inspection', () => {
  const initial = createEngineering('WAKE-03');
  const engineer = act(initial, 'engineer', 'repair:recycler');
  assert.equal(engineer.spares, 1);
  assert.equal(engineer.systems.recycler.wear, 0);
  assert.equal(getReadings(engineer).output, 2, 'Repair testing temporarily reduces throughput');
  assert.equal(getReadings(endEngineeringTurn(engineer)).output, 3);
  const operator = act(initial, 'operator', 'repair:recycler');
  assert.equal(operator.systems.recycler.wear, 2);
  assert.equal(takeEngineeringAction({ ...initial, spares: 0 }, 'engineer', 'repair:power').spares, 0);
});

test('queued jobs can be stood down; input quantities and crew assignments remain finite', () => {
  const initial = createEngineering();
  const queued = act(initial, 'operator', 'fabricate');
  assert.notEqual(actionUnavailable(queued, 'engineer', 'fabricate'), null);
  const cancelled = cancelEngineeringJob(queued, 'fabricate');
  assert.equal(cancelled.available.operator, true);
  assert.equal(cancelled.jobs.length, 0);
  assert.equal(cancelled.feedstock, initial.feedstock);
  assert.equal(endEngineeringTurn(cancelled).spares, initial.spares);
  assert.notEqual(actionUnavailable({ ...initial, feedstock: 0 }, 'engineer', 'fabricate'), null);
});

test('arrival carries specific machinery, supplies, and dated findings into a higher load', () => {
  let state = act(createEngineering(), 'engineer', 'inspect:cooling');
  for (let i = 0; i < 3; i++) state = endEngineeringTurn(state);
  const before = structuredClone(state);
  const arrived = endEngineeringTurn(state);
  assert.equal(arrived.turn, 5);
  assert.equal(arrived.systems.cooling.finding?.turn, 1);
  assert.equal(arrived.systems.cooling.finding?.wear, 5);
  assert.ok(arrived.systems.cooling.wear > 5, 'A dated inspection must not magically track current wear');
  assert.equal(arrived.spares, state.spares);
  assert.equal(getReadings(arrived).demand, 3);
  assert.ok(arrived.history.some(entry => entry.text.startsWith('Arrived at Callisto')));
  assert.deepEqual(state, before);
});

function viableRoute(caseId: CaseId, observe: boolean): EngineeringState {
  let state = createEngineering(caseId);
  // The first inspection varies by case in this full-information test policy.
  const target = caseId === 'WAKE-01' ? 'cooling' : caseId === 'WAKE-02' ? 'power' : 'recycler';
  state = act(state, 'engineer', `inspect:${target}`);
  state = act(state, 'operator', `maintain:${target}`);
  state = endEngineeringTurn(state);
  state = act(state, 'engineer', `repair:${target}`);
  state = endEngineeringTurn(state);
  for (let turn = 3; turn <= 8; turn++) {
    // Service the oldest record, breaking ties in favor of life support then power.
    const id = [...SYSTEMS].sort((a, b) => state.systems[b].serviceAge - state.systems[a].serviceAge
      || ['recycler', 'power', 'cooling'].indexOf(a) - ['recycler', 'power', 'cooling'].indexOf(b))[0];
    state = act(state, 'operator', `maintain:${id}`);
    if (turn === 5 || turn === 6) state = act(state, 'engineer', 'commission');
    else if (observe) state = act(state, 'engineer', 'science');
    state = endEngineeringTurn(state);
  }
  return state;
}

test('every starting case has a viable deterministic route through eight watches', () => {
  for (const caseId of CASES) {
    const state = viableRoute(caseId, true);
    assert.equal(state.turn, 8);
    assert.equal(state.status, 'viable', caseId);
    assert.equal(state.habitat, 2);
    assert.ok(state.science >= 3, caseId);
    assert.ok(state.reserves > 0);
    assert.deepEqual(state, viableRoute(caseId, true));
    assert.equal(endEngineeringTurn(state), state);
    assert.equal(takeEngineeringAction(state, 'engineer', 'science'), state);
  }
});

test('neglect can end a run early; completed history records actual causes for debriefing', () => {
  let state = { ...createEngineering('WAKE-03'), reserves: 2 };
  while (state.status === 'active') state = endEngineeringTurn(state);
  assert.equal(state.status, 'failed');
  assert.equal(state.reserves, 0);
  assert.ok(state.turn < 8);
  assert.equal(state.reports.reduce((sum, report) => sum + report.reserveUse, 0), 2, 'Reports cannot consume more supplies than existed');
  assert.ok(state.history.some(entry => entry.truth?.includes('overdue maintenance')));
  assert.equal(endEngineeringTurn(state), state);
});

test('uncovered life-support demand is reported separately from actual reserve consumption', () => {
  const state = { ...createEngineering('WAKE-03'), turn: 5, reserves: 1 };
  state.systems.recycler.wear = 9;
  const readings = getReadings(state);
  assert.equal(readings.reserveUse, 1);
  assert.equal(readings.unmetDemand, 2);
  const failed = endEngineeringTurn(state);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.reports[0].reserveUse, 1);
  assert.equal(failed.reports[0].unmetDemand, 2);
});

test('a viable workaround route buys more science with supplies and persistent cooling wear', () => {
  let state = setOperation(createEngineering(), 'protected', 'projects');
  const serviceOrder = ['cooling', 'cooling', 'recycler', 'power', 'cooling', 'recycler', 'power', 'cooling'] as const;
  for (let turn = 1; turn <= 8; turn++) {
    state = act(state, 'operator', `maintain:${serviceOrder[turn - 1]}`);
    state = act(state, 'engineer', turn === 5 || turn === 6 ? 'commission' : 'science');
    if (turn === 8) state = setOperation(state, 'override', 'life');
    state = endEngineeringTurn(state);
  }
  const repaired = viableRoute('WAKE-01', true);
  assert.equal(state.status, 'viable');
  assert.equal(state.science, 6);
  assert.equal(state.spares, 2, 'The route preserves spare parts by foregoing repair');
  assert.equal(state.reserves, 4);
  assert.ok(state.science > repaired.science);
  assert.ok(state.systems.cooling.wear > repaired.systems.cooling.wear);
  assert.ok(state.reserves < repaired.reserves);
  assert.equal(state.systems.cooling.finding, null, 'Diagnosis is useful but never a required gate');
});

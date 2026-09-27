import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../src/engine.ts';
import { actionCost, endColonyWeek, startColony, takeColonyAction } from '../src/colony.ts';
import type { CardId, GameState } from '../src/types.ts';

function arrival(ids: CardId[]): GameState {
  const state = createGame('COLONY', 12);
  return { ...state, phase: 'arrived', deck: ids.map((id, index) => ({ uid: index + 1, id })), discard: [], hand: [], inPlay: [] };
}

test('arrival manifest supplies capabilities, reserves, and inherited strain', () => {
  const state = startColony(arrival(['habitation-modules', 'industrial-core', 'europa-instruments', 'colony-stores', 'crew-conflict']));
  assert.deepEqual(state.cargo, { habitat: 2, industry: 1, science: 1 });
  assert.equal(state.reserves, 5);
  assert.equal(state.issues[0].id, 'strain');
  assert.equal(actionCost(state, 'shelter')?.teams, 1);
  assert.equal(actionCost(state, 'recycler')?.power, 2);
  const damaged = startColony(arrival(['habitation-modules', 'europa-instruments']));
  assert.equal(actionCost(damaged, 'recycler')?.teams, 2);
  assert.equal(actionCost(damaged, 'science'), null);
});

test('actions spend finite crew and power; Europa observation is once per eligible week', () => {
  const initial = startColony(arrival(['habitation-modules', 'industrial-core', 'europa-instruments']));
  const shelter = takeColonyAction(initial, 'shelter');
  assert.equal(initial.shelter, 0);
  assert.equal(shelter.teams, 1);
  assert.equal(shelter.power, 2);
  const recycler = takeColonyAction(shelter, 'recycler');
  assert.equal(recycler.power, 0);
  assert.equal(takeColonyAction(recycler, 'shelter'), recycler, 'No capacity remains after both assignments');
  assert.equal(takeColonyAction(shelter, 'fix:missing'), shelter);
  let current = { ...initial, week: 3, reserves: 5 };
  const observed = takeColonyAction(current, 'science');
  assert.equal(observed.science, 1);
  assert.equal(takeColonyAction(observed, 'science'), observed);
  current = endColonyWeek(observed);
  assert.equal(current.observedThisWeek, false);
});

test('uncommissioned systems and older unresolved issues drain reserves, then six weeks end the trial', () => {
  let state = startColony(arrival(['habitation-modules', 'industrial-core', 'europa-instruments', 'crew-conflict']));
  const opening = state.reserves;
  state = endColonyWeek(state);
  assert.equal(state.reserves, opening - 1, 'New strain does not drain reserves immediately');
  assert.equal(state.issues.length, 2);
  state = endColonyWeek(state);
  assert.equal(state.reserves, opening - 3, 'Unfinished systems and old strain each drain one');
  while (state.status === 'active') state = endColonyWeek(state);
  assert.equal(state.status, 'failed');
  assert.equal(endColonyWeek(state), state);
});

test('a viable route trades Europa observations against issue resolution', () => {
  let state = startColony(arrival(['habitation-modules', 'industrial-core', 'europa-instruments', 'crew-conflict', 'colony-stores']));
  const act = (action: Parameters<typeof takeColonyAction>[1]) => { state = takeColonyAction(state, action); };
  const end = () => { state = endColonyWeek(state); };
  act('shelter'); act('fix:strain'); end();
  act('shelter'); act('recycler'); end();
  act('recycler'); act('fix:airlock'); end();
  act('science'); act('fix:contamination'); end();
  act('science'); act('fix:medical'); end();
  act('science'); act('fix:thermal'); end();
  assert.equal(state.status, 'viable');
  assert.equal(state.science, 3);
  assert.equal(state.reserves, 3);
  assert.deepEqual(state.issues.map(i => i.id), ['fatigue']);
});

test('a manifest without Industry can survive by foregoing Europa science', () => {
  let state = startColony(arrival(['habitation-modules', 'europa-instruments', 'crew-conflict']));
  const act = (action: Parameters<typeof takeColonyAction>[1]) => { state = takeColonyAction(state, action); };
  const end = () => { state = endColonyWeek(state); };
  act('shelter'); act('fix:strain'); end();
  act('shelter'); act('fix:airlock'); end();
  act('recycler'); end();
  act('recycler'); end();
  act('fix:contamination'); act('fix:medical'); end();
  act('fix:thermal'); act('fix:fatigue'); end();
  assert.equal(state.status, 'viable');
  assert.equal(state.reserves, 1);
  assert.equal(state.science, 0);
});

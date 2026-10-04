import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../src/engine.ts';
import { startColony } from '../src/colony.ts';
import { renderMissionDebrief } from '../src/debrief.ts';
import type { GameState } from '../src/types.ts';

function arrival(): GameState {
  return {
    ...createGame('REPORT', 12), month: 12, phase: 'arrived', hand: [], inPlay: [], discard: [],
    deck: [{ uid: 1, id: 'colony-stores' }, { uid: 2, id: 'europa-instruments' }, { uid: 3, id: 'fatigue' }],
    retired: [{ uid: 4, id: 'industrial-core' }, { uid: 5, id: 'colony-stores' }, { uid: 6, id: 'medical-followup' }],
    crisisResults: [
      { month: 3, id: 'coolant-leak', response: 'cargo', workSpent: 0, cargoSpent: 'industrial-core', burdensAdded: 0 },
      { month: 6, id: 'medical-isolation', response: 'work', workSpent: 4, cargoSpent: null, burdensAdded: 0 },
      { month: 9, id: 'dosimeter-drift', response: 'defer', workSpent: 0, cargoSpent: null, burdensAdded: 2 },
    ],
  };
}

test('the report separates crisis consumption from other retirement and historical choices from current Burdens', () => {
  const state = arrival();
  const before = structuredClone(state);
  const html = renderMissionDebrief(state);
  assert.match(html, /<strong>3<\/strong><p><b>4<\/b> Cargo points/);
  assert.match(html, /<b>2<\/b> preserved.*<b>1<\/b> consumed/);
  assert.match(html, /1 additional kit retired through Ops/);
  assert.match(html, /<strong>4<\/strong><span>Cargo points/);
  assert.match(html, /<strong>4<\/strong><span>Work spent/);
  assert.match(html, /Industrial Core consumed/);
  assert.match(html, /2 Exposure Monitoring added/);
  assert.match(html, /<li><span>Fatigue<\/span><b>×1<\/b>/);
  assert.doesNotMatch(html, /<li><span>Medical Follow-Up/);
  assert.deepEqual(state, before, 'Rendering must not consume randomness or mutate run state');
});

test('commissioning reports distinguish unplayed, active, viable, failed, and partial science outcomes', () => {
  const state = arrival();
  const colony = startColony(state);
  const before = structuredClone(colony);
  assert.match(renderMissionDebrief(state), /CALLISTO \/ NOT BEGUN/);
  assert.match(renderMissionDebrief(state, colony), /Trial in progress/);
  assert.match(renderMissionDebrief(state, colony), /data-action="colony-resume"/);
  const viable = { ...colony, status: 'viable' as const, week: 6, shelter: 2, recycler: 2, science: 3 };
  const partial = renderMissionDebrief(state, viable);
  assert.match(partial, /Settlement viable/);
  assert.match(partial, /Opening campaign partial/);
  assert.match(partial, /1 observation window closed without data/);
  assert.match(renderMissionDebrief(state, { ...viable, science: 4 }), /Opening campaign complete/);
  const failed = renderMissionDebrief(state, { ...colony, status: 'failed', reserves: 0 });
  assert.match(failed, /Settlement not viable/);
  assert.match(failed, /reserves were exhausted/);
  assert.match(failed, /No observations returned/);
  assert.deepEqual(colony, before);
});

test('negative scores, an eight-crisis voyage, and user-supplied text remain reportable', () => {
  const state = arrival();
  const long = { ...state, seed: '<img src=x onerror="alert(1)">', month: 24, totalMonths: 24, deck: [{ uid: 1, id: 'fatigue' as const }], crisisResults: Array.from({ length: 8 }, (_, i) => ({ ...state.crisisResults[i % 3], month: (i + 1) * 3 })) };
  const html = renderMissionDebrief(long);
  assert.match(html, /ARRIVAL SCORE<\/p><strong>-1<\/strong>/);
  assert.equal((html.match(/class="debrief-decision /g) ?? []).length, 8);
  assert.match(html, /MONTH 24/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advancePhase, beginArrivalTurn, beginMonth, buyCard, canAcquire, canBuyCard,
  commitArrivalWork, createGame, crisisCargoWorkCost, endArrivalTurn, endMonth,
  getArrivalOutcome, getArrivalRequirements, getCurrentCrisis, getScore, ownedCards,
  playAllWork, playCard, resolveChoice, resolveCrisis, respondToEvent, useArrivalCargo,
} from '../src/engine.ts';
import { arrivalEncounter, renderArrivalDebrief, renderArrivalPanel } from '../src/arrival-view.ts';
import type { ArrivalState, CardId, CardInstance, GameState } from '../src/types.ts';

function fixture(hand: CardId[] = [], deck: CardId[] = [], discard: CardId[] = [], overrides: Partial<GameState> = {}): GameState {
  let uid = 1;
  const make = (ids: CardId[]): CardInstance[] => ids.map(id => ({ id, uid: uid++ }));
  const zones = { hand: make(hand), deck: make(deck), discard: make(discard) };
  return { ...createGame('strategy-fixture'), ...zones, inPlay: [], retired: [], nextUid: uid,
    month: 1, phase: 'ops', ops: 1, buys: 1, ...overrides };
}
const ids = (cards: CardInstance[]) => cards.map(card => card.id);
const select = (state: GameState, ...uids: number[]) => resolveChoice(state, { type: 'cards', uids });
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
function conserved(state: GameState) {
  const all = [...ownedCards(state), ...state.retired];
  assert.equal(new Set(all.map(card => card.uid)).size, all.length, 'Each card occupies one zone');
  assert.equal(all.length, state.nextUid - 1, 'Every created card still exists');
}
function arrival(overrides: Partial<ArrivalState> = {}): ArrivalState {
  return { turn: 1, status: 'active', progress: { trajectory: 0, ship: 0, surface: 0 },
    deployed: [], sacrificed: [], damage: 0, fatigueTax: 0, ...overrides };
}
const arrivalState = (hand: CardId[] = [], overrides: Partial<GameState> = {}) => fixture(hand, [], [], {
  month: 24, phase: 'arrival', arrival: arrival(), ...overrides,
});

test('Crew Reassignment retires only Crew Shift and draws only when one is retired', () => {
  const original = freeze(fixture(['crew-reassignment', 'crew-shift', 'fatigue', 'specialist-shift'], ['expert-shift', 'colony-stores']));
  const played = playCard(original, 1);
  assert.equal(played.ops, 1);
  assert.equal(select(played, 3), played);
  assert.equal(select(played, 2, 2), played);
  const skipped = select(played);
  assert.deepEqual(ids(skipped.hand), ['crew-shift', 'fatigue', 'specialist-shift']);
  const retired = select(freeze(played), 2);
  assert.deepEqual(ids(retired.retired), ['crew-shift']);
  assert.deepEqual(ids(retired.hand), ['fatigue', 'specialist-shift', 'expert-shift', 'colony-stores']);
  conserved(retired);
  assert.equal(playCard(fixture(['crew-reassignment']), 1).pending, null);
});

test('Watch Coordination adds two Ops and sifts only Cargo or Burdens', () => {
  const played = playCard(fixture(['watch-coordination', 'colony-stores', 'crew-shift'], ['expert-shift', 'archive-access']), 1);
  assert.equal(played.ops, 2);
  assert.equal(select(played, 3), played);
  const sifted = select(freeze(played), 2);
  assert.deepEqual(ids(sifted.hand), ['crew-shift', 'expert-shift', 'archive-access']);
  assert.deepEqual(ids(sifted.discard), ['colony-stores']);
  assert.equal(sifted.retired.length, 0);
  conserved(sifted);
  assert.equal(select(played).deck.length, 2);
  const burden = playCard(fixture(['watch-coordination', 'fatigue'], ['crew-shift', 'crew-shift']), 1);
  assert.equal(select(burden, 2).hand.length, 2);
});

test('Archive Access retrieves discard identities and cannot replay in-play cards', () => {
  const original = fixture(['archive-access', 'crew-shift'], [], ['watch-coordination']);
  const played = playCard(original, 1);
  assert.equal(select(played, 1), played);
  assert.equal(select(played, 2), played);
  const retrieved = select(freeze(played), 3);
  assert.deepEqual(retrieved.hand.map(card => card.uid), [2, 3]);
  assert.deepEqual(ids(retrieved.inPlay), ['archive-access']);
  assert.equal(retrieved.discard.length, 0);
  conserved(retrieved);
  const replay = playCard(retrieved, 3);
  assert.equal(replay.ops, 2);
  assert.equal(playCard(replay, 1), replay);
  assert.equal(playCard(fixture(['archive-access']), 1).pending, null);
});

test('Cargo Reallocation discards up to two Cargo and retrieves that many Work or Ops', () => {
  const played = playCard(fixture(['cargo-reallocation', 'colony-stores', 'habitation-modules', 'crew-shift'], [],
    ['expert-shift', 'crew-sync', 'industrial-core', 'fatigue']), 1);
  assert.equal(select(played, 4), played);
  assert.equal(select(played).pending, null);
  const discarded = select(freeze(played), 2, 3);
  assert.equal(discarded.pending?.kind, 'retrieve');
  assert.equal(discarded.pending && 'max' in discarded.pending ? discarded.pending.max : 0, 2);
  assert.equal(select(discarded, 7), discarded);
  assert.equal(select(discarded, 8), discarded);
  const retrieved = select(freeze(discarded), 5, 6);
  assert.deepEqual(ids(retrieved.hand), ['crew-shift', 'expert-shift', 'crew-sync']);
  assert.equal(retrieved.retired.length, 0);
  assert.equal(getScore(retrieved).cargo, getScore(played).cargo);
  conserved(retrieved);
});

test('Logistics Network pays at ten-card thresholds, counts Burdens, excludes retired cards, and caps at three', () => {
  for (const [size, maximum] of [[9, 0], [10, 1], [19, 1], [20, 2], [30, 3], [40, 3]]) {
    const state = fixture(['logistics-network'], [], Array.from({ length: size - 1 }, () => 'fatigue'));
    const played = playCard(state, 1);
    assert.equal(played.pending && 'max' in played.pending ? played.pending.max : 0, maximum);
    conserved(played);
  }
  const state = fixture(['logistics-network'], [], Array.from({ length: 9 }, () => 'crew-shift'));
  state.retired.push(state.discard.pop()!);
  assert.equal(playCard(state, 1).pending, null);
});

test('new Work payloads respect the Work phase and leave their conditional Cargo/Burdens in hand', () => {
  const ops = fixture(['batch-preparation', 'equipment-drills', 'contingency-shift', 'colony-stores', 'fatigue', 'medical-followup', 'crew-conflict']);
  assert.equal(playCard(ops, 1), ops);
  const worked = playAllWork(advancePhase(ops));
  assert.equal(worked.work, 9); // 2 + 3 + (2 + capped 2)
  assert.equal(worked.buys, 2);
  assert.deepEqual(ids(worked.hand), ['colony-stores', 'fatigue', 'medical-followup', 'crew-conflict']);
  assert.equal(playAllWork(advancePhase(fixture(['equipment-drills', 'contingency-shift']))).work, 4);
  conserved(worked);
});

test('a crisis can wait for a second hand without payment, new Burdens, or stored Work', () => {
  const before = fixture([], ['crew-shift', 'crew-shift', 'crew-shift', 'crew-shift', 'crew-shift', 'expert-shift'], [], { month: 2, phase: 'report' });
  const opened = beginMonth(before);
  assert.deepEqual(opened.crisisWindow, { id: 'coolant-leak', opened: 3, deadline: 4 });
  const worked = advancePhase(playAllWork(advancePhase(opened)));
  const held = resolveCrisis(freeze(worked), 'wait');
  assert.equal(held.phase, 'buy');
  assert.equal(held.work, 5);
  assert.equal(held.crisisResults.length, 0);
  assert.equal(getScore(held).burdens, 0);
  const next = beginMonth(endMonth(held));
  assert.equal(next.month, 4);
  assert.equal(next.work, 0);
  assert.equal(getCurrentCrisis(next)?.id, 'coolant-leak');
  const deadline = advancePhase(playAllWork(advancePhase(next)));
  assert.equal(resolveCrisis(deadline, 'wait'), deadline);
  assert.equal(endMonth({ ...deadline, phase: 'buy' }).phase, 'buy');
  const resolved = resolveCrisis(deadline, 'work');
  assert.equal(resolved.crisisResults.length, 1);
  assert.equal(resolved.crisisResults[0].month, 4);
  assert.equal(resolved.crisisWindow, null);
  assert.equal(resolveCrisis(resolved, 'defer'), resolved);
  conserved(endMonth(resolved));
});

test('early crisis resolution clears the window; Month 24 cannot wait', () => {
  const crisis = beginMonth(fixture([], [], [], { month: 2, phase: 'report' }));
  const resolved = resolveCrisis(advancePhase(advancePhase(crisis)), 'defer');
  assert.equal(getCurrentCrisis(beginMonth(endMonth(resolved))), null);
  const final = advancePhase(advancePhase(beginMonth(fixture([], [], [], { month: 23, phase: 'report' }))));
  assert.equal(final.crisisWindow?.deadline, 24);
  assert.equal(resolveCrisis(final, 'wait'), final);
  assert.equal(endMonth(resolveCrisis(final, 'defer')).phase, 'arrival-ready');
});

test('Medical Isolation consumes Colony Stores plus two Work atomically; Modules need no Work', () => {
  const crisis = { kind: 'crisis', id: 'medical-isolation' } as const;
  const insufficient = freeze(fixture(['colony-stores'], [], [], { phase: 'crisis', encounter: crisis, work: 1 }));
  assert.equal(crisisCargoWorkCost(getCurrentCrisis(insufficient)!, 'colony-stores'), 2);
  assert.equal(resolveCrisis(insufficient, 'cargo', 'colony-stores'), insufficient);
  const paid = resolveCrisis({ ...insufficient, work: 3 }, 'cargo', 'colony-stores');
  assert.equal(paid.work, 1);
  assert.deepEqual(ids(paid.retired), ['colony-stores']);
  assert.equal(paid.crisisResults[0].workSpent, 2);
  assert.equal(paid.crisisResults[0].cargoSpent, 'colony-stores');
  conserved(paid);
  const modules = fixture([], ['habitation-modules'], [], { phase: 'crisis', encounter: crisis });
  assert.equal(resolveCrisis(modules, 'cargo', 'habitation-modules').crisisResults[0].workSpent, 0);
});

test('Arrival draws the actual remaining voyage deck and forbids buys and gains', () => {
  const ready = freeze(fixture([], ['archive-access', 'crew-shift', 'expert-shift', 'colony-stores', 'rapid-prototyping', 'fatigue'],
    ['watch-coordination'], { month: 24, phase: 'arrival-ready' }));
  const begun = beginArrivalTurn(ready);
  assert.deepEqual(begun.hand.map(card => card.uid), ready.deck.slice(0, 5).map(card => card.uid));
  assert.equal(begun.deck[0].id, 'fatigue');
  assert.equal(begun.rng, ready.rng);
  assert.equal(begun.nextUid, ready.nextUid);
  assert.equal(begun.buys, 0);
  assert.equal(canAcquire(begun, 'crew-sync'), false);
  assert.equal(canBuyCard({ ...begun, phase: 'buy', work: 99, buys: 2 }, 'expert-shift'), false);
  assert.equal(playCard(begun, 5).pending, null, 'Rapid Prototyping cannot create cards during Arrival');
  const batch = playAllWork(advancePhase(fixture(['batch-preparation'], [], [], { arrival: arrival(), buys: 0 })));
  assert.equal(batch.buys, 0, 'Extra Buy effects are inactive during Arrival');
  conserved(begun);
  assert.equal(beginMonth(begun), begun);
});

test('Cargo deployment is once per physical kit, preserves it, and keeps it out of future draws', () => {
  const original = freeze(arrivalState(['industrial-core', 'europa-instruments', 'habitation-modules', 'colony-stores']));
  let state = useArrivalCargo(original, 1, 'deploy');
  assert.deepEqual(state.arrival?.progress, { trajectory: 0, ship: 4, surface: 1 });
  assert.equal(getScore(state).cargo, getScore(original).cargo);
  assert.equal(useArrivalCargo(state, 1, 'deploy'), state);
  assert.equal(useArrivalCargo(state, 1, 'sacrifice'), state);
  state = useArrivalCargo(useArrivalCargo(useArrivalCargo(state, 2, 'deploy'), 3, 'deploy'), 4, 'deploy');
  assert.deepEqual(state.arrival?.progress, { trajectory: 3, ship: 5, surface: 7 });
  assert.equal(beginArrivalTurn(endArrivalTurn(state)).hand.length, 0);
  conserved(state);
});

test('cannibalizing Cargo gives Work, permanently loses the kit, and records industrial loss', () => {
  const original = arrivalState(['industrial-core'], { work: 1, arrival: arrival({ progress: { trajectory: 8, ship: 8, surface: 6 } }) });
  const sacrificed = useArrivalCargo(freeze(original), 1, 'sacrifice');
  assert.equal(sacrificed.work, 4);
  assert.equal(sacrificed.arrival?.sacrificed[0], 'industrial-core');
  assert.equal(sacrificed.retired[0].uid, 1);
  assert.equal(getScore(sacrificed).cargo, 0);
  assert.match(getArrivalOutcome(sacrificed)!.industry, /Industrial capability lost/);
  assert.equal(getArrivalOutcome(sacrificed)!.settlement, true);
  conserved(sacrificed);
});

test('named Burdens impose bounded arrival requirements and a non-stacking deployment cost', () => {
  const burdens = ['fatigue', 'repair-backlog', 'exposure-monitoring', 'medical-followup', 'crew-conflict'] as CardId[];
  const state = arrivalState(burdens.flatMap(id => Array.from({ length: 5 }, () => id)));
  assert.deepEqual(getArrivalRequirements(state), {
    targets: { trajectory: 11, ship: 11, surface: 9 }, minimumShip: 4, fatigue: 2, deploymentCost: 1,
  });
  const held = arrivalState(['crew-conflict', 'colony-stores']);
  assert.equal(useArrivalCargo(held, 2, 'deploy'), held);
  const deployed = useArrivalCargo({ ...held, work: 1 }, 2, 'deploy');
  assert.equal(deployed.work, 0);
  assert.equal(deployed.arrival?.progress.surface, 2);
});

test('Fatigue absorbs generated Work including cannibalization; retirement reduces the next turn pressure', () => {
  const ready = fixture([], ['streamlining', 'fatigue', 'expert-shift', 'industrial-core', 'crew-shift'], [], { month: 24, phase: 'arrival-ready' });
  const begun = beginArrivalTurn(ready);
  assert.equal(begun.arrival?.fatigueTax, 1);
  const cleaned = select(playCard(begun, 1), 2);
  assert.equal(getArrivalRequirements(cleaned).fatigue, 0);
  assert.equal(cleaned.arrival?.fatigueTax, 1, 'Current turn already assessed');
  const worked = advancePhase(playAllWork(advancePhase(cleaned)));
  assert.equal(worked.work, 3);
  assert.equal(worked.arrival?.fatigueTax, 0);
  assert.equal(beginArrivalTurn(endArrivalTurn(worked)).arrival?.fatigueTax, 0);
  const tired = arrivalState(['colony-stores'], { arrival: arrival({ fatigueTax: 2 }) });
  assert.equal(useArrivalCargo(tired, 1, 'sacrifice').work, 1);
});

test('Arrival commits persistent progress, clears the hand, expires Work, and stops after four turns', () => {
  let state = fixture([], Array.from({ length: 8 }, () => 'expert-shift'), [], { month: 24, phase: 'arrival-ready' });
  for (let turn = 1; turn <= 4; turn++) {
    state = beginArrivalTurn(state);
    assert.equal(state.arrival?.turn, turn);
    assert.equal(state.work, 0);
    state = advancePhase(playAllWork(advancePhase(state)));
    if (turn === 1) {
      assert.equal(commitArrivalWork(state, 'trajectory', 1.5), state);
      assert.equal(commitArrivalWork(state, 'trajectory', 9), state);
      state = commitArrivalWork(state, 'trajectory', 8);
    } else if (turn === 2) state = commitArrivalWork(state, 'ship', 8);
    else if (turn === 3) state = commitArrivalWork(state, 'surface', 6);
    state = endArrivalTurn(freeze(state));
    assert.equal(state.phase, turn === 4 ? 'arrived' : 'arrival-report');
    assert.equal(state.hand.length, 0);
    assert.equal(state.inPlay.length, 0);
    assert.equal(state.arrival?.progress.trajectory, 8);
    conserved(state);
  }
  assert.equal(state.arrival?.status, 'complete');
  assert.equal(getArrivalOutcome(state)!.title, 'Callisto settlement activated');
  assert.equal(beginArrivalTurn(state), state);
  assert.equal(endArrivalTurn(state), state);
});

test('missed stage checkpoints damage the ship and raise both readiness and survival needs', () => {
  const failed = endArrivalTurn(arrivalState());
  assert.equal(failed.arrival?.damage, 1);
  assert.equal(getArrivalRequirements(failed).minimumShip, 5);
  assert.equal(getArrivalRequirements(failed).targets.ship, 9);
  const passed = endArrivalTurn(arrivalState([], { arrival: arrival({ progress: { trajectory: 2, ship: 0, surface: 0 } }) }));
  assert.equal(passed.arrival?.damage, 0);
});

test('partial endings distinguish loss, stranded survivors, refuge, emergency foothold, and full activation', () => {
  const scenarios: [number, number, number, string][] = [
    [8, 3, 6, 'Expedition lost'], [0, 4, 6, 'Survivors remain in Jovian orbit'],
    [8, 4, 0, 'Callisto reached: ship-supported refuge'], [8, 4, 6, 'Emergency Callisto foothold'],
    [8, 8, 6, 'Callisto settlement activated'],
  ];
  for (const [trajectory, ship, surface, title] of scenarios) {
    const state = arrivalState([], { arrival: arrival({ turn: 4, status: 'complete', progress: { trajectory, ship, surface } }) });
    assert.equal(getArrivalOutcome(state)?.title, title);
  }
  let enabled = arrivalState(['industrial-core', 'europa-instruments'], { arrival: arrival({ progress: { trajectory: 8, ship: 8, surface: 6 } }) });
  enabled = useArrivalCargo(useArrivalCargo(enabled, 1, 'deploy'), 2, 'deploy');
  assert.match(getArrivalOutcome(enabled)!.industry, /activated/);
  assert.match(getArrivalOutcome(enabled)!.science, /commissioned/);
  assert.match(getArrivalOutcome(arrivalState(['fatigue', 'crew-conflict', 'medical-followup', 'fatigue', 'medical-followup'], { arrival: arrival({ progress: { trajectory: 0, ship: 4, surface: 0 } }) }))!.crew, /Severe/);
});

test('arrival views are immutable, escape player input, and show outcomes before the secondary tally', () => {
  const state = freeze(arrivalState(['fatigue', 'industrial-core'], { phase: 'arrived', seed: '<img src=x onerror=alert(1)>',
    arrival: arrival({ turn: 4, status: 'complete', progress: { trajectory: 8, ship: 4, surface: 6 } }) }));
  const before = JSON.stringify(state);
  const html = renderArrivalDebrief(state);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.indexOf('Emergency Callisto foothold') < html.indexOf('SECONDARY CARGO TALLY'));
  assert.ok(!html.includes('Begin Callisto trial'));
  renderArrivalPanel(state);
  arrivalEncounter({ ...state, phase: 'arrival-ready' });
  assert.equal(JSON.stringify(state), before);
});

test('debrief lists every remaining card by type and count, including deployed Cargo exactly once', () => {
  let state = fixture(['industrial-core', 'crew-sync', 'fatigue'], ['expert-shift', 'crew-sync'],
    ['archive-access', 'industrial-core', 'colony-stores'], { month: 24, phase: 'arrival', arrival: arrival() });
  state = useArrivalCargo(state, 1, 'deploy');
  state.inPlay.push({ id: 'equipment-drills', uid: state.nextUid++ });
  state.retired.push({ id: 'crew-shift', uid: state.nextUid++ });
  state = freeze({ ...state, phase: 'arrived', arrival: { ...state.arrival!, turn: 4, status: 'complete' } });
  const before = JSON.stringify(state);
  const html = renderArrivalDebrief(state);
  const deck = html.slice(html.indexOf('<section class="debrief-deck"'), html.indexOf('<section class="debrief-survived"'));
  assert.match(deck, /<b>9<\/b> cards/);
  const expected = new Map<CardId, number>([
    ['crew-sync', 2], ['expert-shift', 1], ['archive-access', 1], ['equipment-drills', 1],
    ['industrial-core', 2], ['colony-stores', 1], ['fatigue', 1],
  ]);
  assert.equal((deck.match(/data-card-id=/g) ?? []).length, expected.size);
  for (const [id, count] of expected) {
    const row = deck.match(new RegExp(`data-card-id="${id}">[\\s\\S]*?</details>`));
    assert.ok(row, `${id} appears in the deck`);
    assert.match(row[0], new RegExp(`<b>×${count}</b></summary>`));
  }
  assert.match(deck, /Industrial Core<small>1 deployed<\/small>/);
  assert.ok(!deck.includes('data-card-id="crew-shift"'));
  for (const [type, count] of [['Work', 2], ['Ops', 3], ['Cargo', 3], ['Burden', 1]]) {
    assert.ok(deck.includes(`${type}<small>${count} ${count === 1 ? 'card' : 'cards'}</small>`));
  }
  assert.equal(JSON.stringify(state), before);
  conserved(state);
});

test('debrief handles an empty expedition deck without losing the inventory section', () => {
  const html = renderArrivalDebrief(arrivalState([], { phase: 'arrived', arrival: arrival({ turn: 4, status: 'complete' }) }));
  assert.match(html, /Final expedition deck/);
  assert.match(html, /<b>0<\/b> cards/);
  assert.equal((html.match(/None remaining\./g) ?? []).length, 4);
});

test('a complete 24-month cruise and four-turn Arrival replay deterministically with card conservation', () => {
  function run() {
    let state = createGame('FULL-ARRIVAL-REPLAY');
    for (let month = 1; month <= 24; month++) {
      state = beginMonth(state);
      if (state.phase === 'event') state = respondToEvent(state, 'burden');
      state = advancePhase(playAllWork(advancePhase(state)));
      if (state.phase === 'crisis') state = resolveCrisis(state, 'defer');
      if (canBuyCard(state, 'specialist-shift')) state = buyCard(state, 'specialist-shift');
      state = endMonth(state);
      conserved(state);
    }
    assert.equal(state.phase, 'arrival-ready');
    assert.equal(state.crisisResults.length, 8);
    for (let turn = 1; turn <= 4; turn++) {
      state = advancePhase(playAllWork(advancePhase(beginArrivalTurn(state))));
      for (const card of [...state.hand]) if (card.id === 'colony-stores') state = useArrivalCargo(state, card.uid, 'sacrifice');
      const objective = turn === 2 ? 'ship' : turn === 4 ? 'surface' : 'trajectory';
      const amount = Math.min(state.work, Math.max(0, getArrivalRequirements(state).targets[objective] - state.arrival!.progress[objective]));
      if (amount) state = commitArrivalWork(state, objective, amount);
      state = endArrivalTurn(state);
      conserved(state);
    }
    assert.equal(state.phase, 'arrived');
    return state;
  }
  assert.deepEqual(run(), run());
});

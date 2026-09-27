import assert from 'node:assert/strict';
import test from 'node:test';
import { CARDS, CRISES, EVENTS } from '../src/content.ts';
import {
  advancePhase, beginMonth, buyCard, canAcquire, canBuyCard, canPlayCard,
  cardById, createGame, endMonth, getCurrentCrisis, getCurrentEvent, getManifest, getScore,
  ownedCards, playAllWork, playCard, resolveChoice, resolveCrisis, respondToEvent,
} from '../src/engine.ts';
import type { CardId, CardInstance, GameState } from '../src/types.ts';

const OPS: CardId[] = [
  'streamlining', 'crew-sync', 'integrated-diagnostics', 'salvage', 'cross-training',
  'parallel-programs', 'rapid-prototyping', 'load-balancing', 'systems-integration',
  'predictive-maintenance',
];

function turn(
  hand: CardId[] = [],
  deck: CardId[] = [],
  discard: CardId[] = [],
  overrides: Partial<GameState> = {},
): GameState {
  let uid = 1;
  const instances = (ids: CardId[]): CardInstance[] => ids.map((id) => ({ id, uid: uid++ }));
  return {
    ...createGame('fixture'), month: 1, phase: 'ops',
    hand: instances(hand), deck: instances(deck), discard: instances(discard),
    inPlay: [], retired: [], nextUid: 100, ops: 1, buys: 1, work: 0,
    workGenerated: 0, opsPlayed: 0, pending: null, encounter: { kind: 'cruise' },
    allowedOps: null, ...overrides,
  };
}

function ids(cards: CardInstance[]) { return cards.map((card) => card.id); }
function uids(cards: CardInstance[]) { return cards.map((card) => card.uid).sort((a, b) => a - b); }
function allUids(state: GameState) { return uids([...ownedCards(state), ...state.retired]); }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function finishTurn(state: GameState): GameState {
  if (state.phase === 'event') state = respondToEvent(state, 'burden');
  assert.equal(state.phase, 'ops');
  state = advancePhase(state);
  state = playAllWork(state);
  state = advancePhase(state);
  if (state.phase === 'crisis') state = resolveCrisis(state, 'defer');
  const affordable = (['specialist-shift', 'colony-stores', 'crew-shift'] as CardId[])
    .find((id) => canBuyCard(state, id));
  if (affordable) state = buyCard(state, affordable);
  return endMonth(state);
}

function voyage(seed: string, months = 12) {
  let state = createGame(seed, months);
  const encounters: string[] = [];
  for (let month = 1; month <= months; month++) {
    state = beginMonth(state);
    assert.equal(state.month, month);
    encounters.push(state.encounter.kind);
    state = finishTurn(state);
    const unique = allUids(state);
    assert.equal(new Set(unique).size, unique.length, 'Every physical card stays in exactly one zone');
  }
  return { state, encounters };
}

test('the catalogue contains the ten Ops and Cargo for every crisis response', () => {
  assert.equal(new Set(CARDS.map((card) => card.id)).size, CARDS.length);
  assert.deepEqual(CARDS.filter((card) => card.type === 'Ops').map((card) => card.id).sort(), [...OPS].sort());
  const prices = [2, 3, 4, 4, 5, 5, 3, 2, 4, 5];
  OPS.forEach((id, index) => assert.equal(cardById(id).cost, prices[index], id));
  for (const crisis of CRISES) {
    assert.ok(CARDS.some((card) => card.type === 'Cargo' && card.cargoFamily === crisis.cargoFamily));
    assert.ok(crisis.workCost > 0 && crisis.burdenCount > 0);
    assert.equal(cardById(crisis.burden).type, 'Burden');
  }
  for (const event of EVENTS) {
    if (event.effect.kind === 'discard-or-burden') assert.equal(cardById(event.effect.burden).type, 'Burden');
  }
});

test('a seeded starting deck contains seven Crew Shifts and three Colony Stores', () => {
  const state = createGame('departure');
  assert.equal(state.phase, 'briefing');
  assert.equal(state.month, 0);
  assert.equal(state.totalMonths, 12);
  assert.equal(ownedCards(state).length, 10);
  assert.equal(ownedCards(state).filter((card) => card.id === 'crew-shift').length, 7);
  assert.equal(ownedCards(state).filter((card) => card.id === 'colony-stores').length, 3);
  assert.deepEqual(state, createGame('departure'));
  assert.notDeepEqual(state.deck, createGame('different-departure').deck);
  const begun = beginMonth(state);
  assert.equal(begun.hand.length, 5);
  assert.equal(begun.deck.length, 5);
  assert.equal(begun.ops, 1);
  assert.equal(begun.buys, 1);
  assert.equal(begun.work, 0);
});

test('identical seeded decisions reproduce a complete voyage', () => {
  assert.deepEqual(voyage('repeatable'), voyage('repeatable'));
});

test('turn phases, exhausted Ops, and unresolved choices guard illegal actions', () => {
  const initial = createGame('guards');
  assert.equal(endMonth(initial), initial);
  assert.equal(advancePhase(initial), initial);
  const state = turn(['crew-sync', 'crew-shift', 'colony-stores', 'fatigue']);
  assert.equal(beginMonth(state), state);
  for (const card of state.hand.slice(1)) assert.equal(playCard(state, card.uid), state);
  assert.equal(playCard(state, -1), state);
  assert.equal(buyCard(state, 'crew-shift'), state);
  assert.equal(playAllWork(state), state);
  const exhausted = { ...state, ops: 0 };
  assert.equal(canPlayCard(exhausted, exhausted.hand[0].uid), false);
  assert.equal(playCard(exhausted, exhausted.hand[0].uid), exhausted);
  const pending = { ...state, pending: { kind: 'retire', source: 'streamlining', min: 0, max: 4 } } as GameState;
  assert.equal(playCard(pending, pending.hand[0].uid), pending);
  assert.equal(advancePhase(pending), pending);
  const buying = { ...pending, phase: 'buy' } as GameState;
  assert.equal(buyCard(buying, 'crew-shift'), buying);
  assert.equal(endMonth(buying), buying);
  const terminal = { ...state, phase: 'arrived' } as GameState;
  assert.equal(beginMonth(terminal), terminal);
  assert.equal(endMonth(terminal), terminal);
});

test('playing, resolving, purchasing, and cleanup leave their source states unchanged', () => {
  const initial = deepFreeze(turn(['streamlining', 'colony-stores', 'crew-shift']));
  const original = structuredClone(initial);
  const played = deepFreeze(playCard(initial, initial.hand[0].uid));
  const beforeResolve = structuredClone(played);
  const resolved = resolveChoice(played, { type: 'cards', uids: [played.hand[0].uid] });
  assert.deepEqual(initial, original);
  assert.deepEqual(played, beforeResolve);
  const buying = deepFreeze({ ...resolved, phase: 'buy', work: 4 } as GameState);
  const beforeBuy = structuredClone(buying);
  const purchased = deepFreeze(buyCard(buying, 'integrated-diagnostics'));
  const beforeCleanup = structuredClone(purchased);
  endMonth(purchased);
  assert.deepEqual(buying, beforeBuy);
  assert.deepEqual(purchased, beforeCleanup);
});

test('Crew Sync, Integrated Diagnostics, Cross-Training, and Parallel Programs give their exact effects', () => {
  const cases: [CardId, number, number, number, number][] = [
    ['crew-sync', 1, 2, 0, 1], ['integrated-diagnostics', 3, 0, 0, 1],
    ['cross-training', 2, 1, 0, 1], ['parallel-programs', 1, 1, 1, 2],
  ];
  for (const [id, draws, ops, work, buys] of cases) {
    const state = turn([id], ['crew-shift', 'specialist-shift', 'colony-stores', 'expert-shift']);
    const result = playCard(state, state.hand[0].uid);
    assert.equal(result.hand.length, draws, id);
    assert.equal(result.ops, ops, id);
    assert.equal(result.work, work, id);
    assert.equal(result.workGenerated, work, id);
    assert.equal(result.buys, buys, id);
    assert.equal(result.opsPlayed, 1, id);
    assert.deepEqual(ids(result.inPlay), [id]);
    assert.deepEqual(allUids(result), allUids(state));
  }
});

test('Streamlining can retire up to four hand cards but never duplicate or foreign selections', () => {
  const state = turn(['streamlining', 'crew-shift', 'colony-stores', 'fatigue', 'specialist-shift', 'expert-shift']);
  const played = playCard(state, state.hand[0].uid);
  assert.equal(played.pending?.kind, 'retire');
  const hand = played.hand.map((card) => card.uid);
  for (const invalid of [[-1], [hand[0], hand[0]], hand]) {
    assert.equal(resolveChoice(played, { type: 'cards', uids: invalid }), played);
  }
  assert.equal(resolveChoice(played, { type: 'gain', cardId: 'crew-shift' }), played);
  const result = resolveChoice(played, { type: 'cards', uids: hand.slice(0, 4) });
  assert.equal(result.retired.length, 4);
  assert.equal(result.hand.length, 1);
  assert.equal(result.pending, null);
  assert.deepEqual(allUids(result), allUids(state));
  const skipped = resolveChoice(played, { type: 'cards', uids: [] });
  assert.equal(skipped.pending, null);
  assert.equal(skipped.retired.length, 0);
});

test('Salvage gives a fixed two additional Work for any retired Cargo, regardless of its points', () => {
  const cases: [CardId, number][] = [
    ['colony-stores', 3], ['habitation-modules', 3], ['industrial-core', 3], ['crew-shift', 1],
  ];
  for (const [target, expected] of cases) {
    const state = turn(['salvage', target]);
    const played = playCard(state, state.hand[0].uid);
    assert.equal(played.work, 1);
    const result = resolveChoice(played, { type: 'cards', uids: [played.hand[0].uid] });
    assert.equal(result.work, expected);
    assert.equal(result.workGenerated, expected);
    assert.deepEqual(ids(result.retired), [target]);
    assert.equal(getScore(result).cargo, 0, 'Retired Cargo no longer contributes arrival points');
  }
  const state = turn(['salvage', 'colony-stores']);
  const played = playCard(state, state.hand[0].uid);
  assert.equal(resolveChoice(played, { type: 'cards', uids: [] }).work, 1);
});

test('Rapid Prototyping gains an affordable Ops card without spending Work or a Buy', () => {
  const state = turn(['rapid-prototyping']);
  const played = playCard(state, state.hand[0].uid);
  for (const id of ['colony-stores', 'crew-shift', 'cross-training', 'fatigue'] as CardId[]) {
    assert.equal(resolveChoice(played, { type: 'gain', cardId: id }), played, id);
  }
  const result = resolveChoice(played, { type: 'gain', cardId: 'integrated-diagnostics' });
  assert.deepEqual(ids(result.discard), ['integrated-diagnostics']);
  assert.equal(result.work, 0);
  assert.equal(result.buys, 1);
  assert.equal(result.pending, null);
  assert.ok(result.log.some((entry) => entry.kind === 'purchase' && entry.title === 'Gained Integrated Diagnostics'));
});

test('Load Balancing discards chosen hand cards and redraws exactly that many', () => {
  const state = turn(['load-balancing', 'colony-stores', 'fatigue', 'crew-shift'], ['expert-shift', 'specialist-shift']);
  const played = playCard(state, state.hand[0].uid);
  assert.equal(played.ops, 1);
  const result = resolveChoice(played, { type: 'cards', uids: played.hand.slice(0, 2).map((card) => card.uid) });
  assert.deepEqual(ids(result.discard), ['colony-stores', 'fatigue']);
  assert.deepEqual(ids(result.hand), ['crew-shift', 'expert-shift', 'specialist-shift']);
  assert.equal(result.pending, null);
  assert.deepEqual(allUids(result), allUids(state));
  const skipped = resolveChoice(played, { type: 'cards', uids: [] });
  assert.deepEqual(skipped.hand, played.hand);
  assert.equal(skipped.pending, null);
});

test('Systems Integration retires exactly one card and gains up to its cost plus two', () => {
  const state = turn(['systems-integration', 'specialist-shift', 'crew-shift']);
  const played = playCard(state, state.hand[0].uid);
  assert.equal(resolveChoice(played, { type: 'cards', uids: [] }), played);
  assert.equal(resolveChoice(played, { type: 'cards', uids: played.hand.map((card) => card.uid) }), played);
  const retired = resolveChoice(played, { type: 'cards', uids: [played.hand[0].uid] });
  assert.deepEqual(ids(retired.retired), ['specialist-shift']);
  assert.equal(retired.pending?.kind, 'gain');
  assert.equal(resolveChoice(retired, { type: 'gain', cardId: 'expert-shift' }), retired);
  const gained = resolveChoice(retired, { type: 'gain', cardId: 'cross-training' });
  assert.deepEqual(ids(gained.discard), ['cross-training']);
  assert.equal(gained.buys, 1);
  assert.equal(gained.work, 0);
  assert.equal(gained.pending, null);
  assert.ok(gained.log.some((entry) => entry.kind === 'purchase' && entry.title === 'Gained Cross-Training'));

  // Habitation Modules cost 5 but score 3: its upgrade ceiling must be 7, not 5.
  const cargo = turn(['systems-integration', 'habitation-modules']);
  const cargoPlayed = playCard(cargo, cargo.hand[0].uid);
  const cargoRetired = resolveChoice(cargoPlayed, { type: 'cards', uids: [cargoPlayed.hand[0].uid] });
  const industrial = resolveChoice(cargoRetired, { type: 'gain', cardId: 'industrial-core' });
  assert.deepEqual(ids(industrial.discard), ['industrial-core']);
  const expert = resolveChoice(cargoRetired, { type: 'gain', cardId: 'expert-shift' });
  assert.deepEqual(ids(expert.discard), ['expert-shift']);
  assert.deepEqual(ids(expert.retired), ['habitation-modules']);
  assert.equal(expert.pending, null);
});

test('Predictive Maintenance draws first and partitions inspected cards without loss or duplication', () => {
  const state = turn(['predictive-maintenance'], ['crew-shift', 'fatigue', 'colony-stores', 'expert-shift']);
  const played = playCard(state, state.hand[0].uid);
  assert.equal(played.ops, 1);
  assert.deepEqual(ids(played.hand), ['crew-shift']);
  if (played.pending?.kind !== 'inspect') assert.fail('Expected inspection');
  const [first, second] = played.pending.cards.map((card) => card.uid);
  assert.deepEqual(ids(played.pending.cards), ['fatigue', 'colony-stores']);
  assert.deepEqual(allUids(played), allUids(state), 'Inspection is an owned zone');
  for (const invalid of [
    { retire: [first], discard: [], keep: [] },
    { retire: [first], discard: [first], keep: [second] },
    { retire: [first], discard: [-1], keep: [second] },
  ]) assert.equal(resolveChoice(played, { type: 'inspect', ...invalid }), played);
  const split = resolveChoice(played, { type: 'inspect', retire: [first], discard: [second], keep: [] });
  assert.deepEqual(ids(split.retired), ['fatigue']);
  assert.deepEqual(ids(split.discard), ['colony-stores']);
  assert.deepEqual(ids(split.deck), ['expert-shift']);
  assert.deepEqual(allUids(split), allUids(state));
  const reordered = resolveChoice(played, { type: 'inspect', retire: [], discard: [], keep: [second, first] });
  assert.deepEqual(ids(reordered.deck), ['colony-stores', 'fatigue', 'expert-shift']);
});

test('drawing reshuffles only discarded cards, preserves existing top cards, and tolerates an empty deck', () => {
  const state = turn(['integrated-diagnostics'], ['expert-shift'], ['crew-shift', 'colony-stores']);
  const result = playCard(state, state.hand[0].uid);
  assert.equal(result.hand.length, 3);
  assert.equal(result.hand[0].id, 'expert-shift');
  assert.deepEqual(ids(result.inPlay), ['integrated-diagnostics']);
  assert.deepEqual(allUids(result), allUids(state));
  assert.equal(result.discard.length, 0);
  assert.deepEqual(result, playCard(state, state.hand[0].uid));
  const empty = turn(['integrated-diagnostics']);
  const exhausted = playCard(empty, empty.hand[0].uid);
  assert.equal(exhausted.hand.length, 0);
  assert.equal(exhausted.inPlay.length, 1);
  const inspectEmpty = turn(['predictive-maintenance']);
  const inspected = playCard(inspectEmpty, inspectEmpty.hand[0].uid);
  assert.equal(inspected.pending, null, 'An empty inspection must not block the turn');
});

test('Work cards are played in the Work phase and generate their face values exactly once', () => {
  const state = turn(['crew-shift', 'specialist-shift', 'expert-shift', 'colony-stores', 'fatigue', 'crew-sync']);
  const working = advancePhase(state);
  assert.equal(working.phase, 'work');
  assert.equal(playCard(working, working.hand[5].uid), working);
  const result = playAllWork(working);
  assert.equal(result.work, 6);
  assert.equal(result.workGenerated, 6);
  assert.deepEqual(ids(result.hand), ['colony-stores', 'fatigue', 'crew-sync']);
  assert.deepEqual(ids(result.inPlay), ['crew-shift', 'specialist-shift', 'expert-shift']);
  assert.equal(playAllWork(result).work, 6);
});

test('purchases spend Work and Buys without supply caps and issue unique cards', () => {
  let state = turn([], [], [], { phase: 'buy', work: 90, workGenerated: 90, buys: 30 });
  for (let n = 0; n < 30; n++) state = buyCard(state, 'specialist-shift');
  assert.equal(state.discard.length, 30);
  assert.equal(state.work, 0);
  assert.equal(state.buys, 0);
  assert.equal(state.workGenerated, 90);
  assert.equal(new Set(state.discard.map(c => c.uid)).size, 30);
  assert.equal(buyCard(state, 'crew-shift'), state);
  assert.equal(canAcquire(state, 'specialist-shift'), true);
  assert.equal(canAcquire(state, 'fatigue'), false);
  assert.equal(buyCard(state, 'fatigue'), state);
  const poor = turn([], [], [], { phase: 'buy', work: 2 });
  assert.equal(buyCard(poor, 'specialist-shift'), poor);
});

test('specialized Cargo has comparable value, costs Work, and cannot be played normally', () => {
  for (const id of ['habitation-modules', 'industrial-core', 'europa-instruments'] as CardId[]) {
    const short = turn([], [], [], { phase: 'buy', work: 4 });
    assert.equal(canBuyCard(short, id), false);
    assert.equal(buyCard(short, id), short);
    const bought = buyCard({ ...short, work: 5 }, id);
    assert.equal(bought.work, 0);
    assert.equal(bought.buys, 0);
    assert.equal(getScore(bought).cargo, 3);
    for (const phase of ['ops', 'work'] as const) {
      const held = turn([id], [], [], { phase });
      assert.equal(canPlayCard(held, held.hand[0].uid), false);
      assert.equal(playCard(held, held.hand[0].uid), held);
    }
  }
});

test('acquisition restrictions apply equally to purchases and free gains, but never to owned Ops', () => {
  const state = turn(['rapid-prototyping'], [], [], { allowedOps: ['crew-sync'] });
  assert.equal(canAcquire(state, 'crew-sync', 4, 'Ops'), true);
  assert.equal(canAcquire(state, 'integrated-diagnostics', 4, 'Ops'), false);
  assert.equal(canAcquire(state, 'specialist-shift', 4, 'Ops'), false);
  assert.equal(canAcquire(state, 'crew-sync', 2, 'Ops'), false);
  assert.equal(canPlayCard(state, state.hand[0].uid), true);
  const played = playCard(state, state.hand[0].uid);
  assert.equal(resolveChoice(played, { type: 'gain', cardId: 'integrated-diagnostics' }), played);
  const gained = resolveChoice(played, { type: 'gain', cardId: 'crew-sync' });
  assert.deepEqual(ids(gained.discard), ['crew-sync']);
  const buying = { ...state, phase: 'buy', work: 10 } as GameState;
  assert.equal(canBuyCard(buying, 'integrated-diagnostics'), false);
  assert.equal(buyCard(buying, 'integrated-diagnostics'), buying);
  assert.equal(canBuyCard(buying, 'specialist-shift'), true);
  const restricted = turn(['rapid-prototyping'], [], [], { allowedOps: ['cross-training'] });
  assert.equal(playCard(restricted, restricted.hand[0].uid).pending, null, 'No eligible acquisition must not block a gain');
});

test('opening-hand events must be resolved before cards can be played', () => {
  const event = EVENTS.find((entry) => entry.effect.kind === 'discard-or-burden' && entry.effect.cardType === 'Work');
  assert.ok(event);
  const source = turn([], Array(5).fill('colony-stores'), [],
    { month: 1, phase: 'report', eventQueue: [event.id] });
  const started = beginMonth(source);
  assert.equal(started.phase, 'event');
  assert.equal(getCurrentEvent(started)?.id, event.id);
  assert.equal(respondToEvent(started, 'discard'), started, 'Cargo cannot pay a Work discard requirement');
  assert.equal(advancePhase(started), started);
  const burdened = respondToEvent(started, 'burden');
  assert.equal(burdened.phase, 'ops');
  assert.equal(burdened.hand.length, 5);
  assert.equal(burdened.discard.length, 1);
  assert.equal(cardById(burdened.discard[0].id).type, 'Burden');
  assert.equal(respondToEvent(burdened, 'burden'), burdened);
  const enough = beginMonth(turn([], ['crew-shift', 'crew-shift', 'crew-shift', 'colony-stores', 'colony-stores'], [],
    { month: 1, phase: 'report', eventQueue: [event.id] }));
  const choosing = respondToEvent(enough, 'discard');
  assert.equal(choosing.pending?.kind, 'discard');
  assert.equal(resolveChoice(choosing, { type: 'cards', uids: [choosing.hand[4].uid] }), choosing);
  if (event.effect.kind !== 'discard-or-burden') assert.fail('Expected discard event');
  const paid = resolveChoice(choosing, { type: 'cards', uids: choosing.hand.slice(0, event.effect.count).map((card) => card.uid) });
  assert.equal(paid.phase, 'ops');
  assert.equal(paid.hand.length, 5 - event.effect.count);
  assert.equal(paid.pending, null);
});

test('short-hand and restricted-market events apply at opening and reset next month', () => {
  const short = EVENTS.find((event) => event.effect.kind === 'short-hand');
  const restricted = EVENTS.find((event) => event.effect.kind === 'restricted-ops');
  assert.ok(short && restricted);
  const deck: CardId[] = Array(10).fill('crew-shift');
  const smaller = beginMonth(turn([], deck, [], { month: 1, phase: 'report', eventQueue: [short.id] }));
  if (short.effect.kind !== 'short-hand') assert.fail('Expected shorter opening hand');
  assert.equal(smaller.hand.length, short.effect.cards);
  const limited = beginMonth(turn([], deck, [], { month: 1, phase: 'report', eventQueue: [restricted.id] }));
  if (restricted.effect.kind !== 'restricted-ops') assert.fail('Expected restricted market');
  assert.equal(limited.allowedOps?.length, restricted.effect.available);
  assert.equal(new Set(limited.allowedOps).size, limited.allowedOps?.length);
  assert.ok(limited.allowedOps?.every((id) => cardById(id).type === 'Ops'));
  const next = beginMonth(finishTurn(limited));
  assert.equal(next.month, 3);
  assert.equal(next.allowedOps, null);
  assert.equal(next.ops, 1);
  assert.equal(next.buys, 1);
  assert.equal(next.work, 0);
  assert.equal(next.opsPlayed, 0);
  assert.equal(next.workGenerated, 0);
});

test('crises require a response before buying and spending Work reduces buying power', () => {
  const state = turn(['expert-shift', 'expert-shift'], [], [], {
    month: 3, phase: 'work', encounter: { kind: 'crisis', id: CRISES[0].id },
  });
  const choosing = deepFreeze(advancePhase(playAllWork(state)));
  const before = structuredClone(choosing);
  assert.equal(choosing.phase, 'crisis');
  assert.equal(choosing.work, 6);
  assert.equal(getCurrentCrisis(choosing)?.id, CRISES[0].id);
  assert.equal(buyCard(choosing, 'specialist-shift'), choosing);
  assert.equal(endMonth(choosing), choosing);
  assert.equal(advancePhase(choosing), choosing);
  const paid = resolveCrisis(choosing, 'work');
  assert.deepEqual(choosing, before);
  assert.equal(paid.phase, 'buy');
  assert.equal(paid.work, 2);
  assert.equal(paid.workGenerated, 6);
  assert.equal(paid.buys, 1);
  assert.equal(buyCard(paid, 'specialist-shift'), paid);
  assert.equal(resolveCrisis(paid, 'work'), paid);
  assert.equal(resolveCrisis(paid, 'defer'), paid);
  assert.equal(paid.crisisResults[0].workSpent, 4);
  assert.equal(endMonth(paid).crisisResults.length, 1);
});

test('crisis Cargo comes from any owned zone, matches its family, and is permanently spent', () => {
  for (const zone of ['hand', 'deck', 'discard', 'inPlay'] as const) {
    const state = deepFreeze(turn([], [], [], {
      month: 3, phase: 'crisis', encounter: { kind: 'crisis', id: CRISES[0].id }, work: 8,
      [zone]: [{ uid: 50, id: 'industrial-core' }],
    }));
    const before = structuredClone(state);
    assert.equal(resolveCrisis(state, 'cargo', 'habitation-modules'), state);
    assert.equal(resolveCrisis(state, 'cargo', 'crew-shift'), state);
    assert.equal(resolveCrisis(state, 'cargo'), state);
    const used = resolveCrisis(state, 'cargo', 'industrial-core');
    assert.deepEqual(state, before);
    assert.equal(used.work, 8);
    assert.equal(used.buys, 1);
    assert.equal(used[zone].length, 0);
    assert.deepEqual(ids(used.retired), ['industrial-core']);
    assert.equal(getScore(used).total, 0);
    assert.equal(getManifest(used).find(f => f.id === 'industry')?.used, 1);
    assert.equal(resolveCrisis(used, 'cargo', 'industrial-core'), used);
    assert.deepEqual(allUids(used), allUids(state));
  }
  const duplicates = turn(['industrial-core'], ['industrial-core'], ['industrial-core'], {
    month: 3, phase: 'crisis', encounter: { kind: 'crisis', id: CRISES[0].id },
  });
  const used = resolveCrisis(duplicates, 'cargo', 'industrial-core');
  assert.equal(used.hand.length, 0, 'An accessible copy in hand is used first');
  assert.equal(ownedCards(used).length, 2);
  assert.equal(getScore(used).cargo, 6);
});

test('every crisis can be deferred with an empty deck, and deferred Burdens count at final arrival', () => {
  for (const [index, crisis] of CRISES.entries()) {
    const month = (index + 1) * 3;
    const state = deepFreeze(turn([], [], [], {
      month, totalMonths: month, phase: 'crisis', encounter: { kind: 'crisis', id: crisis.id },
    }));
    assert.equal(resolveCrisis(state, 'work'), state);
    const deferred = resolveCrisis(state, 'defer');
    assert.equal(deferred.discard.length, crisis.burdenCount);
    assert.ok(deferred.discard.every(c => c.id === crisis.burden));
    assert.equal(deferred.work, 0);
    assert.equal(deferred.buys, 1);
    assert.equal(deferred.crisisResults.length, 1);
    const arrived = endMonth(deferred);
    assert.equal(arrived.phase, 'arrived');
    assert.equal(getScore(arrived).total, -crisis.burdenCount);
    assert.equal(resolveCrisis(arrived, 'defer'), arrived);
  }
});

test('automatic wear events add exactly one Burden after a normal opening draw', () => {
  for (const event of EVENTS) {
    if (event.effect.kind !== 'gain-burden') continue;
    const source = deepFreeze(turn([], Array(5).fill('crew-shift'), [], {
      month: 1, phase: 'report', eventQueue: [event.id],
    }));
    const started = beginMonth(source);
    assert.equal(started.hand.length, 5);
    assert.equal(started.phase, 'ops');
    assert.deepEqual(ids(started.discard), [event.effect.burden]);
    assert.equal(beginMonth(started), started);
    assert.equal(respondToEvent(started, 'burden'), started);
  }
});

test('score weights mixed Cargo in every owned zone and excludes retired Cargo', () => {
  const state = turn(['habitation-modules'], ['industrial-core'], ['colony-stores', 'fatigue'], {
    inPlay: [{ id: 'habitation-modules', uid: 10 }],
    retired: [{ id: 'industrial-core', uid: 11 }],
    pending: { kind: 'inspect', source: 'predictive-maintenance', cards: [{ id: 'industrial-core', uid: 12 }] },
  });
  assert.equal(ownedCards(state).length, 6);
  assert.deepEqual(getScore(state), { cargo: 13, burdens: 1, total: 12 });
  const manifest = getManifest(state);
  assert.equal(manifest.find(f => f.id === 'habitat')?.count, 3);
  assert.equal(manifest.find(f => f.id === 'industry')?.count, 2);
  assert.equal(manifest.find(f => f.id === 'industry')?.retired, 1);
});

test('arrival occurs after exactly 12 or 24 months, including the final crisis', () => {
  for (const months of [12, 24]) {
    const { state, encounters } = voyage(`length-${months}`, months);
    assert.equal(state.phase, 'arrived');
    assert.equal(state.month, months);
    assert.equal(state.crisisResults.length, months / 3);
    assert.deepEqual(encounters, Array.from({ length: months }, (_, index) => ['cruise', 'event', 'crisis'][index % 3]));
    assert.equal(beginMonth(state), state);
    assert.equal(state.hand.length, 0);
    assert.equal(state.inPlay.length, 0);
  }
});

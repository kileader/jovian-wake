import assert from 'node:assert/strict';
import test from 'node:test';
import { CARDS, CRISES, EVENTS } from '../src/content.ts';
import {
  advancePhase, beginMonth, buyCard, canAcquire, canBuyCard, canPlayCard,
  cardById, createGame, endMonth, getCurrentCrisis, getCurrentEvent, getScore,
  ownedCards, playAllWork, playCard, resolveChoice, respondToEvent,
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

test('the catalogue contains the ten defined Ops and the four escalating crises', () => {
  assert.equal(new Set(CARDS.map((card) => card.id)).size, CARDS.length);
  assert.deepEqual(CARDS.filter((card) => card.type === 'Ops').map((card) => card.id).sort(), [...OPS].sort());
  const prices = [2, 3, 4, 4, 5, 5, 3, 2, 4, 5];
  OPS.forEach((id, index) => assert.equal(cardById(id).cost, prices[index], id));
  assert.deepEqual(CRISES.map(({ handSize, requiredOps, requiredWork }) =>
    [handSize, requiredOps, requiredWork]), [[5, 0, 4], [5, 0, 6], [4, 2, 5], [5, 2, 7]]);
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

test('Salvage generates one Work and gives two additional Work only for retired Cargo', () => {
  for (const [target, expected] of [['colony-stores', 3], ['crew-shift', 1]] as [CardId, number][]) {
    const state = turn(['salvage', target]);
    const played = playCard(state, state.hand[0].uid);
    assert.equal(played.work, 1);
    const result = resolveChoice(played, { type: 'cards', uids: [played.hand[0].uid] });
    assert.equal(result.work, expected);
    assert.equal(result.workGenerated, expected);
    assert.deepEqual(ids(result.retired), [target]);
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
  assert.equal(result.supply['integrated-diagnostics'], played.supply['integrated-diagnostics']! - 1);
  assert.equal(result.work, 0);
  assert.equal(result.buys, 1);
  assert.equal(result.pending, null);
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

test('purchases consume finite piles, Work, and Buys and issue unique card instances', () => {
  const state = turn([], [], [], { phase: 'buy', work: 6, workGenerated: 6, buys: 2 });
  state.supply['specialist-shift'] = 1;
  const bought = buyCard(state, 'specialist-shift');
  assert.equal(bought.work, 3);
  assert.equal(bought.workGenerated, 6);
  assert.equal(bought.buys, 1);
  assert.equal(bought.supply['specialist-shift'], 0);
  assert.equal(buyCard(bought, 'specialist-shift'), bought);
  assert.equal(buyCard(bought, 'expert-shift'), bought);
  const second = buyCard(bought, 'crew-shift');
  assert.equal(second.buys, 0);
  assert.equal(second.work, 3);
  assert.equal(buyCard(second, 'crew-shift'), second);
  assert.equal(new Set(second.discard.map((card) => card.uid)).size, 2);
  assert.ok(second.discard.every((card) => card.uid >= state.nextUid));
  assert.equal(canAcquire(state, 'fatigue'), false);
  assert.equal(buyCard(state, 'fatigue'), state);
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
  const depleted = turn(['rapid-prototyping'], [], [], { supply: {} });
  assert.equal(playCard(depleted, depleted.hand[0].uid).pending, null, 'An empty market must not block a gain');
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

test('a crisis counts generated Work after purchases and is attempted only once', () => {
  const crisis = CRISES[0];
  const state = turn([], [], [], {
    month: 3, phase: 'buy', encounter: { kind: 'crisis', id: crisis.id },
    work: 4, workGenerated: 4,
  });
  assert.equal(getCurrentCrisis(state)?.id, crisis.id);
  const spent = buyCard(state, 'integrated-diagnostics');
  assert.equal(spent.work, 0);
  const completed = endMonth(spent);
  assert.equal(completed.crisisResults.length, 1);
  assert.equal(completed.crisisResults[0].success, true);
  assert.equal(completed.crisisResults[0].work, 4);
  assert.equal(getScore(completed).crises, 3);
  assert.equal(endMonth(completed), completed);
});

test('failing either crisis threshold gains exactly one Burden', () => {
  const crisis = CRISES[2];
  for (const [opsPlayed, workGenerated] of [[1, 5], [2, 4]]) {
    const state = turn([], [], [], {
      month: 9, phase: 'buy', encounter: { kind: 'crisis', id: crisis.id }, opsPlayed, workGenerated,
    });
    const result = endMonth(state);
    assert.equal(result.crisisResults.length, 1);
    assert.equal(result.crisisResults[0].success, false);
    assert.equal(ownedCards(result).length, 1);
    assert.equal(ownedCards(result)[0].id, crisis.burden);
    assert.equal(getScore(result).crises, 0);
    assert.equal(endMonth(result), result);
  }
});

test('score includes Cargo in every owned zone and successful crises, excluding retired cards', () => {
  const state = turn(['colony-stores'], ['colony-stores'], ['colony-stores', 'fatigue'], {
    inPlay: [{ id: 'colony-stores', uid: 10 }],
    retired: [{ id: 'colony-stores', uid: 11 }],
    pending: { kind: 'inspect', source: 'predictive-maintenance', cards: [{ id: 'colony-stores', uid: 12 }] },
    crisisResults: [
      { month: 3, id: CRISES[0].id, success: true, work: 4, ops: 0 },
      { month: 6, id: CRISES[1].id, success: false, work: 3, ops: 1 },
      { month: 9, id: CRISES[2].id, success: true, work: 5, ops: 2 },
    ],
  });
  assert.equal(ownedCards(state).length, 6);
  assert.deepEqual(getScore(state), { cargo: 5, crises: 6, total: 11 });
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

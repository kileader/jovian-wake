// Deterministic smoke playtests, not estimates of human difficulty or enjoyment.
import assert from 'node:assert/strict';
import { CARDS, ARRIVAL_STAGES, DEFAULT_MONTHS } from '../src/content.ts';
import {
  advancePhase, beginArrivalTurn, beginMonth, buyCard, canAcquire, canBuyCard, canPlayCard, cardById,
  commitArrivalWork, createGame, crisisCargoWorkCost, endArrivalTurn, endMonth, getArrivalOutcome,
  getArrivalRequirements, getCurrentCrisis, getCurrentEvent, getScore, ownedCards,
  playAllWork, playCard, resolveChoice, resolveCrisis, respondToEvent, useArrivalCargo,
} from '../src/engine.ts';

const seeds = Number(process.argv[2] ?? 200);
assert.ok(Number.isInteger(seeds) && seeds > 0 && seeds <= 10000, 'Use 1–10000 seeds');
const copies = (state, id) => ownedCards(state).filter(c => c.id === id).length;
const disposable = (state, card, build) => (cardById(card.id).type === 'Burden' && build !== 'burden')
  || (card.id === 'crew-shift' && ownedCards(state).filter(c => cardById(c.id).type === 'Work' && c.id !== 'crew-shift').length >= 4);
const value = card => cardById(card.id).type === 'Ops' ? 5 : cardById(card.id).type === 'Work' ? 4 : cardById(card.id).type === 'Cargo' ? 3 : 0;

function chooseCards(state, build) {
  const p = state.pending;
  if (p.kind === 'gain') {
    const cards = CARDS.filter(c => canAcquire(state, c.id, p.maxCost, p.requiredType));
    assert.ok(cards.length);
    const preferred = ['crew-sync', 'watch-coordination', 'archive-access', 'integrated-diagnostics'];
    const card = preferred.map(id => cards.find(c => c.id === id)).filter(Boolean).sort((a, b) => copies(state, a.id) - copies(state, b.id))[0] ?? cards[0];
    return resolveChoice(state, { type: 'gain', cardId: card.id });
  }
  if (p.kind === 'inspect') {
    return resolveChoice(state, {
      type: 'inspect', retire: p.cards.filter(c => disposable(state, c, build)).map(c => c.uid),
      discard: [], keep: p.cards.filter(c => !disposable(state, c, build)).map(c => c.uid),
    });
  }
  const zone = p.kind === 'retrieve' ? state.discard : state.hand;
  const eligible = zone.filter(c => (!p.requiredType || cardById(c.id).type === p.requiredType)
    && (!p.requiredId || c.id === p.requiredId) && (!p.requiredTypes || p.requiredTypes.includes(cardById(c.id).type)));
  let wanted = p.kind === 'retire' ? eligible.filter(c => disposable(state, c, build))
    : p.kind === 'retrieve' ? [...eligible].sort((a, b) => value(b) - value(a))
    : p.redraw || p.retrieveAfter ? eligible.filter(c => ['Cargo', 'Burden'].includes(cardById(c.id).type)) : eligible;
  if (wanted.length < p.min) wanted = eligible;
  return resolveChoice(state, { type: 'cards', uids: wanted.slice(0, p.max).map(c => c.uid) });
}

function playHand(state, build) {
  let steps = 0;
  while (state.pending || state.phase === 'ops') {
    assert.ok(steps++ < 500, 'Card resolution must finish');
    const previous = state;
    if (state.pending) state = chooseCards(state, build);
    else {
      const order = ['crew-sync', 'watch-coordination', 'parallel-programs', 'cross-training', 'predictive-maintenance',
        'crew-reassignment', 'archive-access', 'cargo-reallocation', 'logistics-network', 'load-balancing',
        'streamlining', 'integrated-diagnostics', 'salvage', 'rapid-prototyping'];
      const card = order.flatMap(id => state.hand.filter(c => c.id === id && canPlayCard(state, c.uid)))[0];
      state = card ? playCard(state, card.uid) : advancePhase(state);
    }
    assert.notEqual(state, previous, 'No stalled choice');
  }
  return advancePhase(playAllWork(state));
}

const builds = {
  work: [['specialist-shift', 5], ['batch-preparation', 2], ['expert-shift', 5]],
  engine: [['crew-sync', 2], ['watch-coordination', 2], ['cross-training', 2], ['integrated-diagnostics', 3], ['parallel-programs', 2], ['specialist-shift', 3]],
  thin: [['streamlining', 1], ['specialist-shift', 4], ['crew-reassignment', 2], ['predictive-maintenance', 2], ['crew-sync', 2], ['expert-shift', 4]],
  fat: [['batch-preparation', 3], ['specialist-shift', 5], ['watch-coordination', 2], ['logistics-network', 2], ['archive-access', 2]],
  cargo: [['equipment-drills', 3], ['specialist-shift', 3], ['watch-coordination', 2], ['archive-access', 2], ['load-balancing', 1], ['cargo-reallocation', 1]],
  burden: [['contingency-shift', 3], ['specialist-shift', 3], ['watch-coordination', 2], ['archive-access', 2], ['logistics-network', 1]],
};
function conserve(state) {
  const all = [...ownedCards(state), ...state.retired];
  assert.equal(new Set(all.map(c => c.uid)).size, all.length, 'Cards must occupy exactly one zone');
  assert.equal(all.length, state.nextUid - 1, 'No cards may be lost');
  assert.ok(state.work >= 0 && state.buys >= 0);
}

function finishArrival(state, build) {
  for (let turn = 1; turn <= 4; turn++) {
    state = playHand(beginArrivalTurn(state), build);
    for (const card of [...state.hand].filter(c => cardById(c.id).type === 'Cargo')) {
      const requirements = getArrivalRequirements(state);
      const progress = state.arrival.progress;
      const useful = card.id === 'industrial-core' ? progress.ship < requirements.targets.ship || progress.surface < requirements.targets.surface
        : card.id === 'europa-instruments' ? progress.trajectory < requirements.targets.trajectory || progress.ship < requirements.targets.ship
        : progress.surface < requirements.targets.surface;
      const deploy = useful && state.work >= requirements.deploymentCost;
      state = useArrivalCargo(state, card.uid, deploy ? 'deploy' : 'sacrifice');
    }
    const stage = ARRIVAL_STAGES[turn - 1];
    const allocate = (objective, target) => {
      const amount = Math.min(state.work, Math.max(0, target - state.arrival.progress[objective]));
      if (amount) state = commitArrivalWork(state, objective, amount);
    };
    if (stage.minimum) allocate(stage.objective, stage.minimum);
    const requirements = getArrivalRequirements(state);
    // Keep basic survival viable, then complete the transfer, surface, and full ship readiness.
    allocate('ship', requirements.minimumShip);
    for (const objective of ['trajectory', 'surface', 'ship']) allocate(objective, requirements.targets[objective]);
    state = endArrivalTurn(state);
    assert.equal(state.phase, turn === 4 ? 'arrived' : 'arrival-report');
    conserve(state);
  }
  return state;
}

function run(seed, build, response) {
  let state = createGame(seed);
  for (let month = 1; month <= DEFAULT_MONTHS; month++) {
    state = beginMonth(state);
    if (state.phase === 'event') {
      const effect = getCurrentEvent(state).effect;
      const eligible = state.hand.filter(c => !effect.cardType || cardById(c.id).type === effect.cardType);
      state = respondToEvent(state, eligible.length >= effect.count && build !== 'burden' ? 'discard' : 'burden');
    }
    state = playHand(state, build);
    if (state.phase === 'crisis') {
      const crisis = getCurrentCrisis(state);
      const cargo = ownedCards(state).find(c => cardById(c.id).cargoFamily === crisis.cargoFamily && state.work >= crisisCargoWorkCost(crisis, c.id));
      const routes = response === 'cargo' ? ['cargo', 'work'] : response === 'work' ? ['work', 'cargo'] : [];
      const route = routes.find(r => r === 'work' ? state.work >= crisis.workCost : !!cargo)
        ?? (response !== 'defer' && state.crisisWindow && month < state.crisisWindow.deadline ? 'wait' : 'defer');
      state = resolveCrisis(state, route, cargo?.id);
    }
    while (state.buys > 0) {
      const infrastructure = month < 20 ? builds[build].find(([id, limit]) => copies(state, id) < limit && canBuyCard(state, id))?.[0] : null;
      const cargo = ['industrial-core', 'europa-instruments', 'habitation-modules'].sort((a, b) => copies(state, a) - copies(state, b)).find(id => canBuyCard(state, id));
      const target = infrastructure ?? cargo ?? (canBuyCard(state, 'colony-stores') ? 'colony-stores' : null);
      if (!target) break;
      state = buyCard(state, target);
    }
    state = endMonth(state);
    assert.equal(state.phase, month === DEFAULT_MONTHS ? 'arrival-ready' : 'report');
    assert.equal(state.crisisResults.length, Math.floor(month / 3) - Number(!!state.crisisWindow));
    conserve(state);
  }
  assert.equal(state.crisisResults.length, 8);
  return finishArrival(state, build);
}

for (const build of Object.keys(builds)) {
  for (const response of ['work', 'cargo', 'defer']) {
    const sums = { points: 0, burdens: 0, cards: 0, survived: 0, settlement: 0, full: 0 };
    for (let n = 0; n < seeds; n++) {
      const state = run(`playtest-${n}`, build, response);
      if (!n) assert.deepEqual(state, run('playtest-0', build, response), 'Replay must be deterministic');
      const outcome = getArrivalOutcome(state);
      sums.points += getScore(state).total;
      sums.burdens += getScore(state).burdens;
      sums.cards += ownedCards(state).length;
      sums.survived += Number(outcome.survived);
      sums.settlement += Number(outcome.settlement);
      sums.full += Number(outcome.settlement && outcome.shipReady);
    }
    console.log(`${build} | prefer ${response} | ${seeds} runs | ` + Object.entries(sums).map(([key, value]) => `${key} ${(value / seeds).toFixed(2)}`).join(' | '));
  }
}

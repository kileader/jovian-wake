// Deterministic smoke playtests, not estimates of human difficulty or enjoyment.
import assert from 'node:assert/strict';
import { CARDS, CRISES, DEFAULT_MONTHS } from '../src/content.ts';
import {
  advancePhase, beginMonth, buyCard, canAcquire, canBuyCard, canPlayCard, cardById,
  createGame, endMonth, getCurrentCrisis, getCurrentEvent, getScore, ownedCards,
  playAllWork, playCard, resolveChoice, resolveCrisis, respondToEvent,
} from '../src/engine.ts';

const seeds = Number(process.argv[2] ?? 200);
assert.ok(Number.isInteger(seeds) && seeds > 0 && seeds <= 10000, 'Use 1–10000 seeds');
const copies = (state, id) => ownedCards(state).filter(c => c.id === id).length;
const disposable = (state, card) => cardById(card.id).type === 'Burden'
  || (card.id === 'crew-shift' && ownedCards(state).filter(c => cardById(c.id).type === 'Work').length > 5);

function chooseCards(state) {
  const p = state.pending;
  if (p.kind === 'gain') {
    const cards = CARDS.filter(c => canAcquire(state, c.id, p.maxCost, p.requiredType));
    return resolveChoice(state, { type: 'gain', cardId: cards.at(-1).id });
  }
  if (p.kind === 'inspect') {
    return resolveChoice(state, {
      type: 'inspect', retire: p.cards.filter(c => disposable(state, c)).map(c => c.uid),
      discard: [], keep: p.cards.filter(c => !disposable(state, c)).map(c => c.uid),
    });
  }
  const eligible = state.hand.filter(c => !p.requiredType || cardById(c.id).type === p.requiredType);
  const wanted = p.kind === 'retire' ? eligible.filter(c => disposable(state, c))
    : [...eligible].sort((a, b) => Number(cardById(a.id).type === 'Work') - Number(cardById(b.id).type === 'Work'));
  const selected = wanted.length >= p.min ? wanted : eligible;
  return resolveChoice(state, { type: 'cards', uids: selected.slice(0, p.kind === 'discard' && !p.redraw ? p.min : p.max).map(c => c.uid) });
}

function run(seed, months, build, response) {
  let state = createGame(seed, months);
  for (let month = 1; month <= months; month++) {
    state = beginMonth(state);
    if (state.phase === 'event') {
      const effect = getCurrentEvent(state).effect;
      const eligible = state.hand.filter(c => !effect.cardType || cardById(c.id).type === effect.cardType);
      state = respondToEvent(state, eligible.length >= effect.count && !effect.cardType ? 'discard' : 'burden');
    }
    let steps = 0;
    while (state.pending || state.phase === 'ops') {
      assert.ok(steps++ < 500, 'Card resolution must finish');
      const previous = state;
      if (state.pending) state = chooseCards(state);
      else {
        const order = ['crew-sync', 'parallel-programs', 'cross-training', 'predictive-maintenance', 'streamlining', 'integrated-diagnostics'];
        const card = order.flatMap(id => state.hand.filter(c => c.id === id && canPlayCard(state, c.uid)))[0];
        state = card ? playCard(state, card.uid) : advancePhase(state);
      }
      assert.notEqual(state, previous, 'No stalled choice');
    }
    state = advancePhase(playAllWork(state));
    if (state.phase === 'crisis') {
      const crisis = getCurrentCrisis(state);
      const cargo = ownedCards(state).find(c => cardById(c.id).cargoFamily === crisis.cargoFamily);
      const routes = response === 'cargo' ? ['cargo', 'work', 'defer'] : response === 'work' ? ['work', 'cargo', 'defer'] : ['defer'];
      const route = routes.find(r => r === 'defer' || (r === 'work' ? state.work >= crisis.workCost : !!cargo));
      state = resolveCrisis(state, route, cargo?.id);
    }
    const nextCrisis = CRISES[(Math.floor(month / 3)) % CRISES.length];
    while (state.buys > 0) {
      const engine = build === 'work'
        ? [['streamlining', 1], ['specialist-shift', 3], ['expert-shift', 4]]
        : [['streamlining', 1], ['crew-sync', 3], ['integrated-diagnostics', 3], ['parallel-programs', 4], ['cross-training', 3], ['specialist-shift', 2]];
      const kit = response === 'cargo' && !ownedCards(state).some(c => cardById(c.id).cargoFamily === nextCrisis.cargoFamily)
        ? CARDS.find(c => c.cargoFamily === nextCrisis.cargoFamily && canBuyCard(state, c.id))?.id : null;
      const engineCard = month < months - 3 ? engine.find(([id, limit]) => copies(state, id) < limit && canBuyCard(state, id))?.[0] : null;
      const cargo = ['industrial-core', 'europa-instruments', 'habitation-modules'].sort((a, b) => copies(state, a) - copies(state, b)).find(id => canBuyCard(state, id));
      const target = kit ?? engineCard ?? cargo ?? (canBuyCard(state, 'colony-stores') ? 'colony-stores' : null);
      if (!target) break;
      state = buyCard(state, target);
    }
    state = endMonth(state);
    assert.equal(state.phase, month === months ? 'arrived' : 'report');
    const all = [...ownedCards(state), ...state.retired];
    assert.equal(new Set(all.map(c => c.uid)).size, all.length, 'Cards must occupy exactly one zone');
    assert.equal(all.length, state.nextUid - 1, 'No cards may be lost');
    assert.equal(state.crisisResults.length, Math.floor(month / 3));
    assert.ok(state.work >= 0 && state.buys >= 0);
  }
  return state;
}

for (const months of [DEFAULT_MONTHS]) {
  for (const build of ['work', 'combo']) {
    for (const response of ['work', 'cargo', 'defer']) {
      const sums = { points: 0, burdens: 0, work: 0, cargo: 0, defer: 0 };
      for (let n = 0; n < seeds; n++) {
        const state = run(`playtest-${n}`, months, build, response);
        if (!n) assert.deepEqual(state, run('playtest-0', months, build, response), 'Replay must be deterministic');
        sums.points += getScore(state).total;
        sums.burdens += getScore(state).burdens;
        for (const result of state.crisisResults) sums[result.response]++;
      }
      console.log(`${months} months | ${build} build | prefer ${response} | ${seeds} runs | ` + Object.entries(sums).map(([key, value]) => `${key} ${(value / seeds).toFixed(1)}`).join(' | '));
    }
  }
}

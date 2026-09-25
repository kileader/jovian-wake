import { CARDS, CRISES, CRISIS_POINTS, DEFAULT_MONTHS, EVENTS } from './content.ts';
import type { CardDefinition, CardId, CardInstance, CardType, ChoiceResolution, Crisis, GameState, LogEntry, PendingChoice, VoyageEvent } from './types.ts';

// FNV-1a seeds Mulberry32. Only transitions consume randomness, never rendering.
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function random(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let value = state.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(state: GameState, values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random(state) * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function copy(state: GameState): GameState {
  return {
    ...state,
    deck: [...state.deck], hand: [...state.hand], discard: [...state.discard],
    inPlay: [...state.inPlay], retired: [...state.retired], supply: { ...state.supply },
    eventQueue: [...state.eventQueue], allowedOps: state.allowedOps && [...state.allowedOps],
    encounter: { ...state.encounter }, crisisResults: [...state.crisisResults], log: [...state.log],
    pending: state.pending?.kind === 'inspect'
      ? { ...state.pending, cards: [...state.pending.cards] }
      : state.pending && { ...state.pending },
  };
}

function log(state: GameState, kind: LogEntry['kind'], title: string, text: string): void {
  state.log.push({ month: state.month, kind, title, text });
}

function instance(state: GameState, id: CardId): CardInstance {
  return { uid: state.nextUid++, id };
}

export function cardById(id: CardId): CardDefinition {
  const card = CARDS.find((entry) => entry.id === id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export function createGame(seed: string, totalMonths = DEFAULT_MONTHS): GameState {
  const state: GameState = {
    seed, rng: hashSeed(seed), nextUid: 1, month: 0,
    totalMonths: Number.isInteger(totalMonths) && totalMonths > 0 && totalMonths % 3 === 0 ? totalMonths : DEFAULT_MONTHS,
    phase: 'briefing', deck: [], hand: [], discard: [], inPlay: [], retired: [],
    supply: Object.fromEntries(CARDS.map((card) => [card.id, card.supply])),
    ops: 0, buys: 0, work: 0, workGenerated: 0, opsPlayed: 0, pending: null,
    encounter: { kind: 'cruise' }, eventQueue: [], allowedOps: null, crisisResults: [], log: [],
  };
  state.deck = shuffle(state, [
    ...Array.from({ length: 7 }, () => instance(state, 'crew-shift')),
    ...Array.from({ length: 3 }, () => instance(state, 'colony-stores')),
  ]);
  return state;
}

export function getCurrentEvent(state: GameState): VoyageEvent | null {
  const encounter = state.encounter;
  return encounter.kind === 'event' ? EVENTS.find((event) => event.id === encounter.id) ?? null : null;
}

export function getCurrentCrisis(state: GameState): Crisis | null {
  const encounter = state.encounter;
  return encounter.kind === 'crisis' ? CRISES.find((crisis) => crisis.id === encounter.id) ?? null : null;
}

export function ownedCards(state: GameState): CardInstance[] {
  return [...state.deck, ...state.hand, ...state.discard, ...state.inPlay, ...(state.pending?.kind === 'inspect' ? state.pending.cards : [])];
}

export function getScore(state: GameState): { cargo: number; crises: number; total: number } {
  const cargo = ownedCards(state).reduce((sum, card) => sum + (cardById(card.id).type === 'Cargo' ? cardById(card.id).points ?? 0 : 0), 0);
  const crises = state.crisisResults.filter((result) => result.success).length * CRISIS_POINTS;
  return { cargo, crises, total: cargo + crises };
}

// Taking cards never touches in-play cards. The top of the deck is index zero.
function takeCards(state: GameState, count: number): CardInstance[] {
  const cards: CardInstance[] = [];
  for (let index = 0; index < count; index++) {
    if (!state.deck.length) {
      if (!state.discard.length) break;
      state.deck = shuffle(state, state.discard);
      state.discard = [];
    }
    cards.push(state.deck.shift()!);
  }
  return cards;
}

function draw(state: GameState, count: number): number {
  const cards = takeCards(state, count);
  state.hand.push(...cards);
  return cards.length;
}

function addWork(state: GameState, amount: number): void {
  state.work += amount;
  state.workGenerated += amount;
}

function gainBurden(state: GameState, id: CardId): void {
  state.discard.push(instance(state, id));
}

export function beginMonth(state: GameState): GameState {
  if ((state.phase !== 'briefing' && state.phase !== 'report') || state.pending || state.month >= state.totalMonths) return state;
  const next = copy(state);
  next.month++;
  next.ops = 1;
  next.buys = 1;
  next.work = 0;
  next.workGenerated = 0;
  next.opsPlayed = 0;
  next.allowedOps = null;
  next.phase = 'ops';
  let handSize = 5;
  let title = 'A month of cruise';
  let rule = 'Normal operations. Build the expedition’s capabilities.';
  if (next.month % 3 === 0) {
    const crisis = CRISES[(next.month / 3 - 1) % CRISES.length];
    next.encounter = { kind: 'crisis', id: crisis.id };
    handSize = crisis.handSize;
    title = crisis.name;
    rule = `Generate ${crisis.requiredWork} Work and play ${crisis.requiredOps} Ops cards this month.`;
  } else if (next.month % 3 === 2) {
    if (!next.eventQueue.length) next.eventQueue = shuffle(next, EVENTS.map((event) => event.id));
    const id = next.eventQueue.shift()!;
    const event = EVENTS.find((entry) => entry.id === id)!;
    next.encounter = { kind: 'event', id };
    title = event.name;
    rule = event.rule;
    if (event.effect.kind === 'short-hand') handSize = event.effect.cards;
    if (event.effect.kind === 'restricted-ops') {
      next.allowedOps = shuffle(next, CARDS.filter((card) => card.type === 'Ops' && (next.supply[card.id] ?? 0) > 0).map((card) => card.id)).slice(0, event.effect.available);
    }
    if (event.effect.kind === 'discard-or-burden') next.phase = 'event';
  } else {
    next.encounter = { kind: 'cruise' };
  }
  const drawn = draw(next, handSize);
  log(next, 'turn', title, `${rule} Drew ${drawn} cards. Start with 1 Ops and 1 Buy.`);
  return next;
}

export function canPlayCard(state: GameState, uid: number): boolean {
  if (state.pending) return false;
  const held = state.hand.find((card) => card.uid === uid);
  if (!held) return false;
  const card = cardById(held.id);
  return (card.type === 'Ops' && state.phase === 'ops' && state.ops > 0)
    || (card.type === 'Work' && state.phase === 'work');
}

export function canAcquire(state: GameState, id: CardId, maxCost = Infinity, requiredType?: CardType): boolean {
  const card = CARDS.find((entry) => entry.id === id);
  return !!card && card.type !== 'Burden' && (state.supply[id] ?? 0) > 0 && card.cost <= maxCost
    && (!requiredType || card.type === requiredType)
    && (card.type !== 'Ops' || state.allowedOps === null || state.allowedOps.includes(id));
}

export function canBuyCard(state: GameState, id: CardId): boolean {
  return state.phase === 'buy' && !state.pending && state.buys > 0 && canAcquire(state, id, state.work);
}

function offerGain(state: GameState, source: CardId, maxCost: number, requiredType?: CardType): void {
  if (CARDS.some((card) => canAcquire(state, card.id, maxCost, requiredType))) {
    state.pending = { kind: 'gain', source, maxCost, ...(requiredType ? { requiredType } : {}) };
  } else {
    log(state, 'card', cardById(source).name, 'No eligible supply pile remains. Continue without gaining a card.');
  }
}

function applySpecial(state: GameState, card: CardDefinition): void {
  switch (card.effect?.special) {
    case 'retire':
      if (state.hand.length) state.pending = { kind: 'retire', source: card.id, min: 0, max: Math.min(4, state.hand.length) };
      break;
    case 'salvage':
      if (state.hand.length) state.pending = { kind: 'retire', source: card.id, min: 0, max: 1, bonusCargoWork: 2 };
      break;
    case 'upgrade':
      if (state.hand.length) state.pending = { kind: 'retire', source: card.id, min: 1, max: 1, upgrade: true };
      else log(state, 'card', card.name, 'No card remains in hand to retire and upgrade.');
      break;
    case 'gain-ops':
      offerGain(state, card.id, 4, 'Ops');
      break;
    case 'discard-redraw':
      if (state.hand.length) state.pending = { kind: 'discard', source: card.id, min: 0, max: state.hand.length, redraw: true };
      break;
    case 'inspect': {
      const cards = takeCards(state, 2);
      if (cards.length) state.pending = { kind: 'inspect', source: card.id, cards };
      else log(state, 'card', card.name, 'No cards remain in the deck or discard to inspect.');
      break;
    }
  }
}

export function playCard(state: GameState, uid: number): GameState {
  if (!canPlayCard(state, uid)) return state;
  const next = copy(state);
  const index = next.hand.findIndex((card) => card.uid === uid);
  const played = next.hand.splice(index, 1)[0];
  const card = cardById(played.id);
  next.inPlay.push(played);
  if (card.type === 'Ops') {
    next.ops--;
    next.opsPlayed++;
  }
  const effect = card.effect ?? {};
  next.ops += effect.ops ?? 0;
  next.buys += effect.buys ?? 0;
  addWork(next, effect.work ?? 0);
  const drawn = draw(next, effect.draw ?? 0);
  const effects = [
    ...(effect.draw ? [`drew ${drawn}`] : []),
    ...(effect.ops ? [`+${effect.ops} Ops`] : []),
    ...(effect.work ? [`+${effect.work} Work`] : []),
    ...(effect.buys ? [`+${effect.buys} Buy`] : []),
  ];
  log(next, 'card', `Played ${card.name}`, effects.length ? `${effects.join(' · ')}.` : card.text);
  applySpecial(next, card);
  return next;
}

export function playAllWork(state: GameState): GameState {
  if (state.phase !== 'work' || state.pending) return state;
  return state.hand.filter((card) => cardById(card.id).type === 'Work').reduce((next, card) => playCard(next, card.uid), state);
}

export function advancePhase(state: GameState): GameState {
  if (state.pending || (state.phase !== 'ops' && state.phase !== 'work')) return state;
  return { ...state, phase: state.phase === 'ops' ? 'work' : 'buy' };
}

export function buyCard(state: GameState, id: CardId): GameState {
  if (!canBuyCard(state, id)) return state;
  const next = copy(state);
  const card = cardById(id);
  next.work -= card.cost;
  next.buys--;
  next.supply[id]!--;
  next.discard.push(instance(next, id));
  log(next, 'purchase', `Bought ${card.name}`, `Spent ${card.cost} Work and 1 Buy. The card goes to discard.`);
  return next;
}

export function respondToEvent(state: GameState, response: 'discard' | 'burden'): GameState {
  const event = getCurrentEvent(state);
  if (state.phase !== 'event' || state.pending || event?.effect.kind !== 'discard-or-burden') return state;
  const effect = event.effect;
  if (response === 'discard') {
    const eligible = state.hand.filter((card) => !effect.cardType || cardById(card.id).type === effect.cardType);
    if (eligible.length < effect.count) return state;
    return { ...state, pending: { kind: 'discard', source: 'event', min: effect.count, max: effect.count, redraw: false, ...(effect.cardType ? { requiredType: effect.cardType } : {}) } };
  }
  if (response !== 'burden') return state;
  const next = copy(state);
  gainBurden(next, effect.burden);
  next.phase = 'ops';
  log(next, 'event', event.name, `Kept the hand and gained ${cardById(effect.burden).name} in discard.`);
  return next;
}

function selectedCards(state: GameState, uids: number[], pending: Extract<PendingChoice, { kind: 'retire' | 'discard' }>): CardInstance[] | null {
  if (uids.length < pending.min || uids.length > pending.max || new Set(uids).size !== uids.length) return null;
  const cards = uids.map((uid) => state.hand.find((card) => card.uid === uid));
  if (cards.some((card) => !card)) return null;
  const found = cards as CardInstance[];
  if (pending.kind === 'discard' && pending.requiredType && found.some((card) => cardById(card.id).type !== pending.requiredType)) return null;
  return found;
}

function names(cards: CardInstance[]): string {
  return cards.map((card) => cardById(card.id).name).join(', ') || 'none';
}

export function resolveChoice(state: GameState, resolution: ChoiceResolution): GameState {
  const pending = state.pending;
  if (!pending) return state;
  if (pending.kind === 'gain') {
    if (resolution.type !== 'gain' || !canAcquire(state, resolution.cardId, pending.maxCost, pending.requiredType)) return state;
    const next = copy(state);
    next.pending = null;
    next.supply[resolution.cardId]!--;
    next.discard.push(instance(next, resolution.cardId));
    log(next, 'purchase', `Gained ${cardById(resolution.cardId).name}`, `${cardById(pending.source).name} added this card to discard without spending Work or a Buy.`);
    return next;
  }
  if (pending.kind === 'inspect') {
    if (resolution.type !== 'inspect') return state;
    const all = [...resolution.retire, ...resolution.discard, ...resolution.keep];
    if (all.length !== pending.cards.length || new Set(all).size !== all.length || all.some((uid) => !pending.cards.some((card) => card.uid === uid))) return state;
    const ordered = (uids: number[]) => uids.map((uid) => pending.cards.find((card) => card.uid === uid)!);
    const retired = ordered(resolution.retire);
    const discarded = ordered(resolution.discard);
    const kept = ordered(resolution.keep);
    const next = copy(state);
    next.pending = null;
    next.retired.push(...retired);
    next.discard.push(...discarded);
    next.deck = [...kept, ...next.deck];
    log(next, 'retirement', cardById(pending.source).name, `Retired: ${names(retired)}. Discarded: ${names(discarded)}. Kept on top, first to last: ${names(kept)}.`);
    return next;
  }
  if (resolution.type !== 'cards') return state;
  const selected = selectedCards(state, resolution.uids, pending);
  if (!selected) return state;
  const next = copy(state);
  next.pending = null;
  next.hand = next.hand.filter((card) => !resolution.uids.includes(card.uid));
  if (pending.kind === 'retire') {
    next.retired.push(...selected);
    const bonus = (pending.bonusCargoWork ?? 0) * selected.filter((card) => cardById(card.id).type === 'Cargo').length;
    addWork(next, bonus);
    log(next, 'retirement', cardById(pending.source).name, `Retired: ${names(selected)}.${bonus ? ` Gained ${bonus} Work for retiring Cargo.` : ''}`);
    if (pending.upgrade) offerGain(next, pending.source, cardById(selected[0].id).cost + 2);
  } else {
    next.discard.push(...selected);
    const drawn = pending.redraw ? draw(next, selected.length) : 0;
    if (pending.source === 'event') next.phase = 'ops';
    log(next, pending.source === 'event' ? 'event' : 'card', pending.source === 'event' ? getCurrentEvent(next)!.name : cardById(pending.source).name, `Discarded: ${names(selected)}.${pending.redraw ? ` Drew ${drawn} replacements.` : ''}`);
  }
  return next;
}

export function endMonth(state: GameState): GameState {
  if (state.phase !== 'buy' || state.pending) return state;
  const next = copy(state);
  const crisis = getCurrentCrisis(next);
  if (crisis) {
    const success = next.workGenerated >= crisis.requiredWork && next.opsPlayed >= crisis.requiredOps;
    next.crisisResults.push({ month: next.month, id: crisis.id, success, work: next.workGenerated, ops: next.opsPlayed });
    if (!success) gainBurden(next, crisis.burden);
    log(next, 'crisis', `${success ? 'Resolved' : 'Failed'}: ${crisis.name}`, `${success ? crisis.successText : crisis.failureText} Generated ${next.workGenerated} Work; played ${next.opsPlayed} Ops cards.${success ? ` Earned ${CRISIS_POINTS} arrival points.` : ` Gained ${cardById(crisis.burden).name} in discard.`}`);
  }
  next.discard.push(...next.hand, ...next.inPlay);
  next.hand = [];
  next.inPlay = [];
  next.phase = next.month >= next.totalMonths ? 'arrived' : 'report';
  log(next, 'turn', 'Month complete', `Generated ${next.workGenerated} Work; ${next.work} unspent. Played ${next.opsPlayed} Ops cards. Cards in hand and in play moved to discard.`);
  return next;
}

import { ARRIVAL_STAGES, CARDS, CARGO_FAMILIES, CRISES, DEFAULT_MONTHS, EVENTS } from './content.ts';
import type { ArrivalObjective, CardDefinition, CardId, CardInstance, CardType, ChoiceResolution, Crisis, GameState, LogEntry, PendingChoice, VoyageEvent } from './types.ts';

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
    inPlay: [...state.inPlay], retired: [...state.retired],
    eventQueue: [...state.eventQueue], allowedOps: state.allowedOps && [...state.allowedOps],
    encounter: { ...state.encounter }, crisisResults: [...state.crisisResults], log: [...state.log],
    crisisWindow: state.crisisWindow && { ...state.crisisWindow },
    arrival: state.arrival && { ...state.arrival, progress: { ...state.arrival.progress }, deployed: [...state.arrival.deployed], sacrificed: [...state.arrival.sacrificed], demands: state.arrival.demands.map(result => ({ ...result })) },
    pending: state.pending?.kind === 'inspect'
      ? { ...state.pending, cards: [...state.pending.cards] }
      : state.pending && { ...state.pending },
  };
}

function log(state: GameState, kind: LogEntry['kind'], title: string, text: string): void {
  state.log.push({ month: state.month, kind, title, text, ...(state.arrival ? { arrivalTurn: state.arrival.turn } : {}) });
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
    ops: 0, buys: 0, work: 0, workGenerated: 0, opsPlayed: 0, pending: null,
    encounter: { kind: 'cruise' }, eventQueue: [], allowedOps: null, crisisResults: [], crisisWindow: null, arrival: null, log: [],
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
  if (state.crisisWindow) return CRISES.find(crisis => crisis.id === state.crisisWindow!.id) ?? null;
  const encounter = state.encounter;
  return encounter.kind === 'crisis' ? CRISES.find((crisis) => crisis.id === encounter.id) ?? null : null;
}

export function ownedCards(state: GameState): CardInstance[] {
  return [...state.deck, ...state.hand, ...state.discard, ...state.inPlay, ...(state.pending?.kind === 'inspect' ? state.pending.cards : []), ...(state.arrival?.deployed ?? [])];
}

export function getScore(state: GameState): { cargo: number; burdens: number; total: number } {
  const cargo = ownedCards(state).reduce((sum, card) => sum + (cardById(card.id).type === 'Cargo' ? cardById(card.id).points ?? 0 : 0), 0);
  const burdens = ownedCards(state).filter((card) => cardById(card.id).type === 'Burden').length;
  return { cargo, burdens, total: cargo - burdens };
}

export function getManifest(state: GameState) {
  const cards = ownedCards(state);
  return CARGO_FAMILIES.map((family) => {
    const preserved = cards.filter((card) => cardById(card.id).cargoFamily === family.id);
    return {
      ...family, count: preserved.length,
      points: preserved.reduce((sum, card) => sum + (cardById(card.id).points ?? 0), 0),
      retired: state.retired.filter((card) => cardById(card.id).cargoFamily === family.id).length,
      used: state.crisisResults.filter((result) => result.cargoSpent && cardById(result.cargoSpent).cargoFamily === family.id).length,
    };
  });
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
  if (state.arrival?.status === 'active') {
    const absorbed = Math.min(amount, state.arrival.fatigueTax);
    state.arrival.fatigueTax -= absorbed;
    amount -= absorbed;
  }
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
    next.crisisWindow = { id: crisis.id, opened: next.month, deadline: Math.min(next.month + 1, next.totalMonths) };
    next.encounter = { kind: 'crisis', id: crisis.id };
    title = crisis.name;
    rule = `After playing Work, spend ${crisis.workCost} Work, consume 1 ${crisis.cargoFamily} Cargo, or take ${crisis.burdenCount} ${cardById(crisis.burden).name} cards. Then acquire cards.`;
  } else if (next.month % 3 === 2) {
    if (!next.eventQueue.length) next.eventQueue = shuffle(next, EVENTS.map((event) => event.id));
    const id = next.eventQueue.shift()!;
    const event = EVENTS.find((entry) => entry.id === id)!;
    next.encounter = { kind: 'event', id };
    title = event.name;
    rule = event.rule;
    if (event.effect.kind === 'short-hand') handSize = event.effect.cards;
    if (event.effect.kind === 'restricted-ops') {
      next.allowedOps = shuffle(next, CARDS.filter((card) => card.type === 'Ops' && card.available !== false).map((card) => card.id)).slice(0, event.effect.available);
    }
    if (event.effect.kind === 'discard-or-burden') next.phase = 'event';
  } else {
    next.encounter = { kind: 'cruise' };
  }
  if (next.crisisWindow) {
    next.encounter = { kind: 'crisis', id: next.crisisWindow.id };
    const crisis = getCurrentCrisis(next)!;
    title = crisis.name;
    rule = `Response due by Month ${next.crisisWindow.deadline}. Pay on either hand, or carry ${crisis.burdenCount} ${cardById(crisis.burden).name}.`;
  }
  const drawn = draw(next, handSize);
  log(next, 'turn', title, `${rule} Drew ${drawn} cards. Start with 1 Ops and 1 Buy.`);
  const event = getCurrentEvent(next);
  if (event?.effect.kind === 'gain-burden') {
    gainBurden(next, event.effect.burden);
    log(next, 'event', event.name, `Gained 1 ${cardById(event.effect.burden).name} in discard. It can be drawn after a reshuffle.`);
  }
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
  if (state.arrival || state.phase === 'arrival-ready' || state.phase === 'arrived') return false;
  const card = CARDS.find((entry) => entry.id === id);
  return !!card && card.available !== false && card.type !== 'Burden' && card.cost <= maxCost
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
    log(state, 'card', cardById(source).name, 'No eligible card is available this month. Continue without gaining a card.');
  }
}

function offerRetrieve(state: GameState, source: CardId, max: number, requiredTypes?: CardType[]): void {
  const eligible = state.discard.filter(card => !requiredTypes || requiredTypes.includes(cardById(card.id).type));
  if (max > 0 && eligible.length) state.pending = { kind: 'retrieve', source, min: 0, max: Math.min(max, eligible.length), ...(requiredTypes ? { requiredTypes } : {}) };
  else log(state, 'card', cardById(source).name, 'No eligible card is available in discard.');
}

function applySpecial(state: GameState, card: CardDefinition): void {
  switch (card.effect?.special) {
    case 'crew-retire':
      if (state.hand.some(c => c.id === 'crew-shift')) state.pending = { kind: 'retire', source: card.id, min: 0, max: 1, requiredId: 'crew-shift', drawOnRetire: 2 };
      break;
    case 'watch-discard':
      if (state.hand.some(c => ['Cargo', 'Burden'].includes(cardById(c.id).type))) state.pending = { kind: 'discard', source: card.id, min: 0, max: 1, redraw: true, requiredTypes: ['Cargo', 'Burden'], drawPerCard: 2 };
      break;
    case 'retrieve': offerRetrieve(state, card.id, 1); break;
    case 'logistics-retrieve': offerRetrieve(state, card.id, Math.min(3, Math.floor(ownedCards(state).length / 10))); break;
    case 'cargo-reallocate':
      if (state.hand.some(c => cardById(c.id).type === 'Cargo')) state.pending = { kind: 'discard', source: card.id, min: 0, max: Math.min(2, state.hand.length), redraw: false, requiredType: 'Cargo', retrieveAfter: true };
      break;
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
  const extraBuys = next.arrival ? 0 : effect.buys ?? 0;
  next.buys += extraBuys;
  const bonusWork = effect.conditionalWork === 'cargo' ? Number(next.hand.some(c => cardById(c.id).type === 'Cargo'))
    : effect.conditionalWork === 'burden' ? Math.min(2, next.hand.filter(c => cardById(c.id).type === 'Burden').length) : 0;
  addWork(next, (effect.work ?? 0) + bonusWork);
  const drawn = draw(next, effect.draw ?? 0);
  const effects = [
    ...(effect.draw ? [`drew ${drawn}`] : []),
    ...(effect.ops ? [`+${effect.ops} Ops`] : []),
    ...(effect.work || bonusWork ? [`+${(effect.work ?? 0) + bonusWork} Work`] : []),
    ...(extraBuys ? [`+${extraBuys} Buy`] : []),
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
  return { ...state, phase: state.phase === 'ops' ? 'work' : state.arrival ? 'arrival' : getCurrentCrisis(state) ? 'crisis' : 'buy' };
}

export function crisisCargoWorkCost(crisis: Crisis, cargoId: CardId): number {
  return crisis.id === 'medical-isolation' && cargoId === 'colony-stores' ? 2 : 0;
}

export function resolveCrisis(state: GameState, response: 'work' | 'cargo' | 'defer' | 'wait', cargoId?: CardId): GameState {
  const crisis = getCurrentCrisis(state);
  if (state.phase !== 'crisis' || state.pending || !crisis || state.crisisResults.some((result) => result.month === state.month)) return state;
  if (response === 'wait') {
    if (!state.crisisWindow || state.month >= state.crisisWindow.deadline) return state;
    const next = copy(state);
    next.phase = 'buy';
    log(next, 'crisis', crisis.name, `Response held open until Month ${next.crisisWindow!.deadline}. No payment or Burdens yet.`);
    return next;
  }
  if (response === 'work' && state.work < crisis.workCost) return state;
  if (response === 'cargo' && (!cargoId || cardById(cargoId).cargoFamily !== crisis.cargoFamily || !ownedCards(state).some((card) => card.id === cargoId))) return state;
  const cargoWork = response === 'cargo' ? crisisCargoWorkCost(crisis, cargoId!) : 0;
  if (state.work < cargoWork) return state;
  if (!['work', 'cargo', 'defer'].includes(response)) return state;
  const next = copy(state);
  let text = '';
  if (response === 'work') {
    next.work -= crisis.workCost;
    text = `${crisis.workText} Spent ${crisis.workCost} Work; ${next.work} remains for acquisitions.`;
  } else if (response === 'cargo') {
    next.work -= cargoWork;
    // Prefer an accessible copy; identical cards within a zone are interchangeable.
    for (const zone of [next.hand, next.discard, next.deck, next.inPlay]) {
      const index = zone.findIndex((card) => card.id === cargoId);
      if (index < 0) continue;
      next.retired.push(...zone.splice(index, 1));
      break;
    }
    const cargo = cardById(cargoId!);
    text = `${crisis.cargoText} Consumed 1 ${cargo.name}${cargoWork ? ` and spent ${cargoWork} Work` : ''}; it leaves the deck permanently and forfeits its arrival capability and ${cargo.points} secondary points.`;
  } else {
    for (let index = 0; index < crisis.burdenCount; index++) gainBurden(next, crisis.burden);
    text = `${crisis.deferText} Gained ${crisis.burdenCount} ${cardById(crisis.burden).name} cards in discard.`;
  }
  next.crisisResults.push({
    month: next.month, id: crisis.id, response,
    workSpent: response === 'work' ? crisis.workCost : cargoWork,
    cargoSpent: response === 'cargo' ? cargoId! : null,
    burdensAdded: response === 'defer' ? crisis.burdenCount : 0,
  });
  next.crisisWindow = null;
  next.phase = 'buy';
  log(next, 'crisis', crisis.name, text);
  return next;
}

export function buyCard(state: GameState, id: CardId): GameState {
  if (!canBuyCard(state, id)) return state;
  const next = copy(state);
  const card = cardById(id);
  next.work -= card.cost;
  next.buys--;
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

function selectedCards(state: GameState, uids: number[], pending: Extract<PendingChoice, { kind: 'retire' | 'discard' | 'retrieve' }>): CardInstance[] | null {
  if (uids.length < pending.min || uids.length > pending.max || new Set(uids).size !== uids.length) return null;
  const zone = pending.kind === 'retrieve' ? state.discard : state.hand;
  const cards = uids.map((uid) => zone.find((card) => card.uid === uid));
  if (cards.some((card) => !card)) return null;
  const found = cards as CardInstance[];
  if (pending.kind === 'retire' && pending.requiredId && found.some(card => card.id !== pending.requiredId)) return null;
  if (pending.kind === 'discard' && pending.requiredType && found.some((card) => cardById(card.id).type !== pending.requiredType)) return null;
  if (pending.kind !== 'retire' && pending.requiredTypes && found.some(card => !pending.requiredTypes!.includes(cardById(card.id).type))) return null;
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
  if (pending.kind === 'retrieve') {
    next.discard = next.discard.filter(card => !resolution.uids.includes(card.uid));
    next.hand.push(...selected);
    log(next, 'card', cardById(pending.source).name, `Retrieved: ${names(selected)}. Played cards remain unavailable until cleanup.`);
    return next;
  }
  next.hand = next.hand.filter((card) => !resolution.uids.includes(card.uid));
  if (pending.kind === 'retire') {
    next.retired.push(...selected);
    if (pending.drawOnRetire && selected.length) draw(next, pending.drawOnRetire * selected.length);
    const bonus = (pending.bonusCargoWork ?? 0) * selected.filter((card) => cardById(card.id).type === 'Cargo').length;
    addWork(next, bonus);
    log(next, 'retirement', cardById(pending.source).name, `Retired: ${names(selected)}.${bonus ? ` Gained ${bonus} Work for retiring Cargo.` : ''}`);
    if (pending.upgrade) offerGain(next, pending.source, cardById(selected[0].id).cost + 2);
  } else {
    next.discard.push(...selected);
    const drawn = pending.redraw ? draw(next, selected.length * (pending.drawPerCard ?? 1)) : 0;
    if (pending.source === 'event') next.phase = 'ops';
    log(next, pending.source === 'event' ? 'event' : 'card', pending.source === 'event' ? getCurrentEvent(next)!.name : cardById(pending.source).name, `Discarded: ${names(selected)}.${pending.redraw ? ` Drew ${drawn} replacements.` : ''}`);
    if (pending.retrieveAfter && selected.length) offerRetrieve(next, pending.source as CardId, selected.length, ['Work', 'Ops']);
  }
  return next;
}

export function endMonth(state: GameState): GameState {
  if (state.phase !== 'buy' || state.pending) return state;
  if (getCurrentCrisis(state) && !state.crisisResults.some((result) => result.month === state.month)
    && (!state.crisisWindow || state.month >= state.crisisWindow.deadline)) return state;
  const next = copy(state);
  next.discard.push(...next.hand, ...next.inPlay);
  next.hand = [];
  next.inPlay = [];
  next.phase = next.month >= next.totalMonths ? 'arrival-ready' : 'report';
  log(next, 'turn', 'Month complete', `Generated ${next.workGenerated} Work; ${next.work} unspent. Played ${next.opsPlayed} Ops cards. Cards in hand and in play moved to discard.`);
  return next;
}

export function getArrivalRequirements(state: GameState) {
  const cards = ownedCards(state);
  const count = (id: CardId) => cards.filter(card => card.id === id).length;
  const damage = state.arrival?.damage ?? 0;
  return {
    targets: { trajectory: 8 + Math.min(3, count('exposure-monitoring')), ship: 8 + Math.min(3, count('repair-backlog')) + damage, surface: 6 + Math.min(3, count('medical-followup')) },
    minimumShip: 4 + damage,
    fatigue: Math.min(2, count('fatigue')),
    deploymentCost: count('crew-conflict') ? 1 : 0,
  };
}

/** Readiness can be prepared early; operations must be staffed on their own turn. */
export function getArrivalDemand(state: GameState) {
  const turn = Math.max(1, state.arrival?.turn ?? 1);
  const stage = ARRIVAL_STAGES[turn - 1];
  const support = Math.min(2, (state.arrival?.deployed ?? []).filter(card => cardById(card.id).cargoFamily === stage.support).length);
  const required = stage.work - support;
  const paid = state.arrival?.demandPaid ?? 0;
  return { stage, required, paid, support, remaining: Math.max(0, required - paid) };
}

export function payArrivalDemand(state: GameState, amount = 1): GameState {
  if (state.phase !== 'arrival' || state.pending || state.arrival?.status !== 'active'
    || !Number.isInteger(amount) || amount <= 0 || amount > state.work || amount > getArrivalDemand(state).remaining) return state;
  const next = copy(state);
  next.work -= amount;
  next.arrival!.demandPaid += amount;
  log(next, 'arrival', `${getArrivalDemand(next).stage.name} operations`, `Committed ${amount} Work to this turn's demand. This payment does not carry into later stages or add readiness progress.`);
  return next;
}

/** Continue the actual draw/discard cycle; arrival never manufactures a replacement deck. */
export function beginArrivalTurn(state: GameState): GameState {
  if (state.pending || !['arrival-ready', 'arrival-report'].includes(state.phase)
    || state.arrival?.status === 'complete' || (state.arrival?.turn ?? 0) >= 4) return state;
  const next = copy(state);
  next.arrival ??= { turn: 0, status: 'active', progress: { trajectory: 0, ship: 0, surface: 0 }, deployed: [], sacrificed: [], damage: 0, fatigueTax: 0, demandPaid: 0, demands: [] };
  next.arrival.turn++;
  next.arrival.demandPaid = 0;
  next.arrival.fatigueTax = getArrivalRequirements(next).fatigue;
  next.phase = 'ops';
  next.ops = 1;
  next.buys = 0;
  next.work = 0;
  next.workGenerated = 0;
  next.opsPlayed = 0;
  next.allowedOps = null;
  next.crisisWindow = null;
  next.encounter = { kind: 'cruise' };
  const drawn = draw(next, 5);
  const demand = getArrivalDemand(next);
  log(next, 'arrival', demand.stage.name, `Arrival turn ${next.arrival.turn}/4. Drew ${drawn} cards from the voyage deck. This stage needs ${demand.required} fresh Work (${demand.support} deployed Cargo support). Acquisitions are closed.${next.arrival.fatigueTax ? ` Fatigue will absorb ${next.arrival.fatigueTax} Work this turn.` : ''}`);
  return next;
}

export function commitArrivalWork(state: GameState, objective: ArrivalObjective, amount = 1): GameState {
  if (state.phase !== 'arrival' || state.pending || state.arrival?.status !== 'active'
    || !['trajectory', 'ship', 'surface'].includes(objective) || !Number.isInteger(amount) || amount <= 0 || amount > state.work) return state;
  const remaining = getArrivalRequirements(state).targets[objective] - state.arrival.progress[objective];
  if (amount > remaining) return state;
  const next = copy(state);
  next.work -= amount;
  next.arrival!.progress[objective] += amount;
  log(next, 'arrival', `${objective[0].toUpperCase()}${objective.slice(1)} progress`, `Committed ${amount} Work. Progress persists across arrival turns.`);
  return next;
}

export function useArrivalCargo(state: GameState, uid: number, action: 'deploy' | 'sacrifice'): GameState {
  const card = state.hand.find(card => card.uid === uid);
  if (state.phase !== 'arrival' || state.pending || state.arrival?.status !== 'active' || !card
    || cardById(card.id).type !== 'Cargo' || !['deploy', 'sacrifice'].includes(action)) return state;
  const cost = action === 'deploy' ? getArrivalRequirements(state).deploymentCost : 0;
  if (state.work < cost) return state;
  const next = copy(state);
  next.hand = next.hand.filter(held => held.uid !== uid);
  next.work -= cost;
  if (action === 'sacrifice') {
    next.retired.push(card);
    next.arrival!.sacrificed.push(card.id);
    const before = next.work;
    addWork(next, 3);
    log(next, 'arrival', `${cardById(card.id).name} cannibalized`, `Cargo permanently lost; gained ${next.work - before} usable Work after Fatigue.`);
  } else {
    next.arrival!.deployed.push(card);
    const progress = next.arrival!.progress;
    if (card.id === 'colony-stores') progress.surface += 2;
    else if (card.id === 'habitation-modules') progress.surface += 4;
    else if (card.id === 'industrial-core') { progress.ship += 4; progress.surface++; }
    else if (card.id === 'europa-instruments') { progress.trajectory += 3; progress.ship++; }
    log(next, 'arrival', `${cardById(card.id).name} deployed`, `Equipment remains preserved; its readiness effect happens once. Matching deployed kits reduce stage demands by 1 each, maximum 2.${cost ? ` Spent ${cost} Work coordinating the deployment.` : ''}`);
  }
  return next;
}

export function endArrivalTurn(state: GameState): GameState {
  if (state.phase !== 'arrival' || state.pending || state.arrival?.status !== 'active') return state;
  const next = copy(state);
  const demand = getArrivalDemand(next);
  const met = demand.remaining === 0;
  next.arrival!.demands.push({ turn: next.arrival!.turn, required: demand.required, paid: demand.paid, support: demand.support, met });
  if (!met && next.arrival!.turn < 4) next.arrival!.damage++;
  log(next, 'arrival', met ? 'Stage demand met' : 'Stage demand missed', `${demand.stage.name}: ${demand.paid}/${demand.required} Work committed; ${demand.support} Cargo support.${met ? ' Operations completed on this turn.' : ` ${demand.stage.failure}`}`);
  next.discard.push(...next.hand, ...next.inPlay);
  next.hand = [];
  next.inPlay = [];
  if (next.arrival!.turn === 4) {
    next.arrival!.status = 'complete';
    next.phase = 'arrived';
  } else next.phase = 'arrival-report';
  log(next, 'arrival', `Arrival turn ${next.arrival!.turn} complete`, `Generated ${next.workGenerated} usable Work; ${next.work} unspent. Hand cleared; objectives persist.`);
  return next;
}

export function getArrivalOutcome(state: GameState) {
  const arrival = state.arrival;
  if (!arrival) return null;
  const requirements = getArrivalRequirements(state);
  const complete = arrival.status === 'complete';
  const met = (turn: number) => arrival.demands.some(result => result.turn === turn && result.met);
  const trajectoryReady = arrival.progress.trajectory >= requirements.targets.trajectory && (!complete || met(3));
  const shipReady = arrival.progress.ship >= requirements.targets.ship && (!complete || (met(1) && met(2)));
  const surfaceReady = arrival.progress.surface >= requirements.targets.surface && (!complete || met(4));
  const survived = arrival.progress.ship >= requirements.minimumShip;
  const settlement = complete && survived && trajectoryReady && surfaceReady;
  const cards = ownedCards(state);
  const has = (id: CardId) => cards.some(card => card.id === id);
  const deployed = (id: CardId) => arrival.deployed.some(card => card.id === id);
  const title = !complete ? 'Jovian Arrival in progress'
    : !survived ? 'Expedition lost'
    : !trajectoryReady ? 'Survivors remain in Jovian orbit'
    : !surfaceReady ? 'Callisto reached: ship-supported refuge'
    : !shipReady ? 'Emergency Callisto foothold'
    : 'Callisto settlement activated';
  const crewBurdens = cards.filter(card => ['fatigue', 'crew-conflict', 'medical-followup'].includes(card.id)).length;
  return {
    title, survived, settlement, trajectoryReady, shipReady, surfaceReady,
    industry: !survived ? 'Industrial capability lost with the expedition' : settlement && deployed('industrial-core') ? 'Industrial workshop activated'
      : has('industrial-core') ? 'Industrial Core preserved; activation pending'
      : state.retired.some(card => card.id === 'industrial-core') ? 'Industrial capability lost: Industrial Core cannibalized or retired' : 'No Industrial Core prepared',
    science: !survived ? 'Europa science lost with the expedition' : settlement && deployed('europa-instruments') ? 'Europa science package commissioned'
      : has('europa-instruments') ? 'Europa instruments preserved; campaign deferred' : 'Europa science abandoned: no instruments remain',
    crew: !survived ? 'Ship survival requirements were not met' : crewBurdens >= 5 ? 'Severe crew problems remain' : crewBurdens ? 'Crew survives with unresolved care or coordination problems' : 'No unresolved crew care or coordination problems',
  };
}

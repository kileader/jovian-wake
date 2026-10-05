import './style.css';
import './debrief.css';
import './table.css';
import './arrival.css';
import { arrivalEncounter, renderArrivalPanel, renderArrivalDebrief } from './arrival-view.ts';
import { CARDS, CARGO_FAMILIES, CRISES } from './content.ts';
import {
  advancePhase, beginMonth, buyCard, canAcquire, canBuyCard, canPlayCard, cardById,
  createGame, endMonth, getCurrentCrisis, getCurrentEvent, getScore, ownedCards,
  crisisCargoWorkCost, beginArrivalTurn, commitArrivalWork, payArrivalDemand, endArrivalTurn, useArrivalCargo,
  playAllWork, playCard, resolveChoice, resolveCrisis, respondToEvent,
} from './engine.ts';
import type { ArrivalObjective, CardId, CardInstance, Crisis, CrisisResult, GameState } from './types.ts';
import { createSoundController } from './sound.ts';
import { createFeedback } from './feedback.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const sound = createSoundController();
const feedback = createFeedback(app, sound);
const params = new URLSearchParams(location.search);
const randomSeed = () => `CALLISTO-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;
let state = createGame(params.get('seed')?.trim().slice(0, 80) || randomSeed());
let selected: number[] = [];
let inspection: Record<number, 'keep' | 'discard' | 'retire'> = {};
let reverseKept = false;
let logOpen = false;
let inventoryOpen = false;
let supplyType: 'Work' | 'Cargo' | 'Ops' = 'Work';
let selectedSupply: CardId = 'specialist-shift';
let tableView: 'hand' | 'supply' | 'deck' = 'hand';
const h = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pad = (n: number) => String(n).padStart(2, '0');
const active = () => ['event', 'ops', 'work', 'crisis', 'buy', 'arrival'].includes(state.phase);
const arrow = '<span aria-hidden="true">↗</span>';

function soundButton() {
  return `<button class="text-button sound-toggle" data-action="sound" aria-label="Sound effects" aria-pressed="${sound.enabled()}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3z"/>${sound.enabled() ? '<path d="M13 7c2 1 2 5 0 6m2-9c4 3 4 9 0 12"/>' : '<path d="m13 7 5 6m0-6-5 6"/>'}</svg><span>Sound ${sound.enabled() ? 'on' : 'off'}</span></button>`;
}

function voyageTrack(compact = false) {
  return `<div class="journey-labels"><span>EARTH</span><span>MONTH ${pad(state.month)} / ${state.totalMonths}</span><span>${compact ? 'JUPITER / ' : ''}CALLISTO</span></div>
    <div class="journey-track" aria-hidden="true">${Array.from({ length: state.totalMonths }, (_, i) => `<i class="${i < state.month ? 'passed' : ''} ${i % 3 === 2 ? 'crisis-mark' : ''}" title="Month ${i + 1}: ${['Cruise', 'Event', 'Crisis'][i % 3]}"></i>`).join('')}</div>`;
}

function hero() {
  return `<section class="hero ${state.month ? 'cruising' : ''}" aria-label="Voyage progress">
    <div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> ${state.phase === 'arrived' ? 'CALLISTO / ARRIVAL' : 'ONE WAY / JOVIAN SYSTEM'}</p>
    <h1>${state.month === 0 ? 'The long way out.' : state.phase === 'arrived' ? 'What did we bring?' : 'Make the next hand count.'}</h1>
    <p class="hero-description">30 people. ${state.totalMonths} months. Everything we have is on this ship.</p>
    ${voyageTrack()}</div>
    <div class="space-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="planet"></div><div class="moon"></div><span class="planet-label">JUPITER SYSTEM<br><b>05.2 AU · SOL</b></span><span class="schematic">ARTIST’S IMPRESSION</span></div>
  </section>`;
}

function briefing() {
  return `<p class="eyebrow">CAPTAIN’S BRIEFING / HOW TO PLAY</p><h2 id="dispatch-title" tabindex="-1">Get the crew to Callisto.</h2>
    <p class="dispatch-body">Build your deck over 24 months, then use it in four turns of Jovian Arrival. Staff each stage with fresh Work, preserve or sacrifice Cargo, and establish Trajectory, Ship, and Surface readiness. The ending leads the report; Cargo points are secondary.</p>
    <ol class="briefing-steps">
      <li><span>01</span><div><strong>First month: click “Play Work.”</strong><p>Your starting hand has no Ops cards. The button plays every Crew Shift in your hand and gives you Work to spend.</p></div></li>
      <li><span>02</span><div><strong>Prepare a card, then end the month.</strong><p>Choose a supply category and card, then click “Acquire card.” It goes to your discard pile and joins your deck after a shuffle.</p></div></li>
      <li><span>03</span><div><strong>Repeat with new hands.</strong><p>Later, play Ops cards before Work. Every third month opens a crisis. Resolve it on either of two hands, or take Burdens. The final crisis closes in Month 24.</p></div></li>
    </ol>
    <div class="launch-controls"><label class="seed-label" for="launch-seed">VOYAGE SEED<input id="launch-seed" maxlength="80" value="${h(state.seed)}" autocomplete="off" spellcheck="false"></label>
    <button class="primary" data-action="begin">Begin the cruise ${arrow}</button></div>
    <p class="microcopy">Starting deck: 7 Crew Shifts and 3 Colony Stores. No timer. Reloading resets the voyage.</p>
    <p class="microcopy"><a href="?mode=engineering" style="text-decoration: underline">Try the engineering experiment ↗</a> · Eight watches of coupled machinery, diagnosis, and commissioning.</p>`;
}

function crisisTerms(crisis: Crisis) {
  const family = CARGO_FAMILIES.find(f => f.id === crisis.cargoFamily)!.name;
  return crisis.id === 'medical-isolation' ? '4 Work; Colony Stores + 2 Work; Habitation Modules; or 2 Medical Follow-Up.' : `${crisis.workCost} Work, 1 ${family} Cargo, or ${crisis.burdenCount} ${cardById(crisis.burden).name} cards.`;
}

function responseSummary(result: CrisisResult) {
  return result.response === 'work' ? `Spent ${result.workSpent} Work`
    : result.response === 'cargo' ? `Used ${cardById(result.cargoSpent!).name}${result.workSpent ? ` + ${result.workSpent} Work` : ''}`
    : `Deferred · +${result.burdensAdded} ${cardById(CRISES.find(c => c.id === result.id)!.burden).name}`;
}

function crisisDecision() {
  const crisis = getCurrentCrisis(state);
  if (!crisis) return '';
  const result = state.crisisResults.find(r => r.month === state.month);
  if (result) return `<p class="event-rule">${h(responseSummary(result))}. Use remaining Work for acquisitions.</p>`;
  const deadline = state.crisisWindow?.deadline ?? state.month;
  const window = `<p class="crisis-window"><strong>Response due by Month ${deadline}.</strong> Payment is made in one month; Work does not carry between hands.</p>`;
  if (state.phase !== 'crisis') return `${window}<p class="event-rule">${state.phase === 'buy' ? 'Response held open. Next hand:' : 'After Ops and Work:'} ${h(crisisTerms(crisis))}</p>`;
  const choosing = !state.pending;
  const cargo = CARDS.filter(c => c.cargoFamily === crisis.cargoFamily && ownedCards(state).some(held => held.id === c.id));
  return `${window}<section class="crisis-decision" aria-label="Crisis responses"><div class="crisis-options">
    <div><h3>Refit with crew time</h3><p class="crisis-work-budget" data-counter="work"><b>${state.work}</b> Work available</p><button class="secondary" data-action="crisis-work" ${!choosing || state.work < crisis.workCost ? 'disabled' : ''}>Spend ${crisis.workCost} Work</button></div>
    ${cargo.map(c => {
      const work = crisisCargoWorkCost(crisis, c.id);
      return `<div><h3>Use ${h(c.name)}</h3><p class="microcopy">Permanently lose this kit and ${c.points} secondary points.${work ? ` Also spend ${work} Work.` : ' No Work payment.'}</p><button class="secondary" data-action="crisis-cargo" data-cargo-id="${c.id}" ${!choosing || state.work < work ? 'disabled' : ''}>Consume ${h(c.name)}${work ? ` + ${work} Work` : ''}</button></div>`;
    }).join('')}
    <div><h3>Carry the obligations</h3><p class="microcopy">Keep Work and Cargo. Burdens affect future draws and Arrival.</p><button class="secondary" data-action="crisis-defer" ${!choosing ? 'disabled' : ''}>Take ${crisis.burdenCount} ${h(cardById(crisis.burden).name)}</button></div>
    ${state.month < deadline ? `<div><h3>Use the next hand</h3><p class="microcopy">Continue acquisitions now. Respond next month without paying or taking Burdens yet.</p><button class="secondary" data-action="crisis-wait" ${!choosing ? 'disabled' : ''}>Hold open until Month ${deadline}</button></div>` : ''}</div></section>`;
}

function burdenPreview(id: CardId) {
  const card = cardById(id);
  return `<aside class="burden-preview" id="burden-preview" aria-label="${h(card.name)} explained"><div><strong>${h(card.name)}</strong><span class="eyebrow">BURDEN</span></div><p>${h(card.text)}</p><p>Goes into your discard pile and returns in later shuffles. Retire it with a card such as Streamlining to remove it permanently.</p></aside>`;
}

function turnPanel() {
  if (state.arrival || state.phase === 'arrival-ready') return '<div class="table-encounter">'+arrivalEncounter(state)+(active() ? nextAction() : '')+'</div>';
  const event = getCurrentEvent(state);
  const crisis = getCurrentCrisis(state);
  return `<div class="table-encounter"><div class="dispatch-header"><span class="eyebrow">${state.encounter.kind.toUpperCase()}</span><span class="status-tag">${state.totalMonths - state.month} MONTHS REMAIN</span></div>
    <h2 id="dispatch-title" tabindex="-1">${h(crisis?.name || event?.name || 'Room to work.')}</h2>
    ${crisis || event ? `<details class="encounter-detail"><summary>Encounter details</summary><p>${h(crisis?.description || event?.description || '')}</p>${crisis ? `<p><strong>Crew repair:</strong> ${h(crisis.workText)}</p><p><strong>Cargo response:</strong> ${h(crisis.cargoText)}</p><p><strong>Deferred:</strong> ${h(crisis.deferText)}</p>${burdenPreview(crisis.burden)}` : event?.effect.kind === 'gain-burden' || event?.effect.kind === 'discard-or-burden' ? burdenPreview(event.effect.burden) : ''}</details>` : ''}
    ${nextAction()}
    ${event ? `<p class="event-rule">${h(event.rule)}</p>` : ''}
    ${crisisDecision()}
    ${state.phase === 'event' && event?.effect.kind === 'discard-or-burden' ? eventDecision(event.effect) : ''}
    </div>`;
}

function nextAction() {
  let instruction: string;
  if (state.pending) {
    instruction = state.pending.kind === 'gain' ? 'Choose a supply card, then click Gain card.'
      : state.pending.kind === 'inspect' ? 'Choose what happens to each inspected card, then confirm.'
      : state.pending.kind === 'retrieve' ? 'Select cards from discard below, then confirm retrieval.'
      : 'Select cards from your hand below, then confirm your choice.';
  } else if (state.phase === 'event') {
    instruction = 'Choose one event response below to continue.';
  } else if (state.phase === 'ops') {
    instruction = state.ops > 0 && state.hand.some(c => cardById(c.id).type === 'Ops')
      ? 'Play an Ops card from your hand, or finish Ops and play all Work.'
      : state.arrival ? 'Finish Ops and play Work below. Your Work cards will play automatically.' : 'Click “Play Work” below. Your Work cards will play automatically.';
  } else if (state.phase === 'work') {
    instruction = 'Play your Work cards, or use the button below to play them all.';
  } else if (state.phase === 'crisis') {
    instruction = 'Choose a crisis response. You can acquire cards afterward.';
  } else if (state.phase === 'arrival') {
    instruction = 'Use the Arrival panel to commit Work or deploy Cargo. Then end the turn.';
  } else {
    instruction = state.buys > 0
      ? `Choose a supply card, then click Acquire card. You have ${state.work} Work and ${state.buys} ${state.buys === 1 ? 'Buy' : 'Buys'}.`
      : 'You have no Buys left. End the month to draw a new hand.';
  }
  return `<p class="next-action"><strong>YOUR NEXT MOVE</strong><span>${instruction}</span></p>`;
}

function eventDecision(effect: { count: number; cardType?: string; burden: CardId }) {
  const eligible = state.hand.filter(c => !effect.cardType || cardById(c.id).type === effect.cardType).length;
  return `<div class="event-actions"><button class="secondary" data-action="event-discard" ${state.pending || eligible < effect.count ? 'disabled' : ''}>Discard ${effect.count} ${effect.cardType || 'cards'}</button><button class="secondary" data-action="event-burden" ${state.pending ? 'disabled' : ''}>Gain ${h(cardById(effect.burden).name)}</button></div><p class="microcopy">Discard without replacement draws, or carry a Burden: a lost hand slot, a named Arrival penalty, and −1 secondary point until retired.${eligible < effect.count ? ' Not enough eligible cards to discard.' : ''}</p>`;
}

function phaseControls() {
  const phase = state.phase;
  if (state.arrival) return `<nav class="phase-strip" aria-label="Arrival sequence">Ops → Work → Arrival</nav>
    <div class="turn-actions"><div class="turn-feedback" data-feedback-slot><p class="turn-hint">Use the Arrival panel after Work. Acquisitions are closed.</p></div>
    ${phase === 'ops' ? `<button class="primary" data-action="work" ${state.pending ? 'disabled' : ''}>Finish Ops & play Work ↗</button>`
      : phase === 'work' ? `<button class="primary" data-action="all-work" ${state.pending ? 'disabled' : ''}>Play all Work & prepare arrival ↗</button>` : ''}</div>`;
  const hint = phase === 'ops' ? 'Playing Work ends the Ops phase.'
    : phase === 'work' ? `Play your Work cards, then ${getCurrentCrisis(state) ? 'respond to the crisis' : 'acquire cards'}.`
    : phase === 'buy' ? `${state.buys ? 'Acquire a card or end the month.' : 'No Buys left. Ready to end the month.'} Unused Work expires.`
    : phase === 'crisis' ? 'Choose one of the responses above. Work spent on the problem is unavailable for acquisitions.'
    : 'Resolve the event before playing your hand.';
  return `<nav class="phase-strip" aria-label="Monthly sequence">${[['ops', '1 · Ops'], ['work', '2 · Work'], ...(getCurrentCrisis(state) ? [['crisis', '3 · Respond'], ['buy', '4 · Acquire']] : [['buy', '3 · Acquire']])].map(([key, label]) => `<span ${key === phase ? 'aria-current="step"' : ''}>${label}</span>`).join('<i aria-hidden="true">→</i>')}</nav>
    <div class="turn-actions">
    <div class="turn-feedback" data-feedback-slot><p class="turn-hint">${h(hint)}</p></div>
    ${phase === 'ops' ? `<button class="primary" data-action="work" ${state.pending ? 'disabled' : ''}>${state.ops && state.hand.some(c => cardById(c.id).type === 'Ops') ? 'Finish Ops & play Work' : 'Play Work'} ${arrow}</button>` : ''}
    ${phase === 'work' ? `<button class="primary" data-action="all-work" ${state.pending ? 'disabled' : ''}>Play all Work & ${getCurrentCrisis(state) ? 'respond' : 'acquire'} ${arrow}</button>` : ''}
    ${phase === 'buy' ? `<button class="primary" data-action="end" ${state.pending ? 'disabled' : ''}>End month ${pad(state.month)} ${arrow}</button>` : ''}</div>`;
}

function report() {
  const result = state.crisisResults.find(r => r.month === state.month);
  const entries = state.log.filter(e => e.month === state.month && ['purchase', 'retirement', 'crisis', 'event'].includes(e.kind));
  return `<p class="eyebrow">MONTH ${pad(state.month)} / LOG RECORDED</p><h2 id="dispatch-title" tabindex="-1">${result ? result.response !== 'defer' ? 'The work is done.' : 'A workaround will have to do.' : 'A month behind us.'}</h2>
    <p class="dispatch-body">${result ? h(responseSummary(result)) + '. The crossing continues.' : 'The hand is discarded. Work and unused Ops do not carry forward.'}</p>
    <div class="report-entries">${entries.length ? entries.map(e => `<p><strong>${h(e.title)}</strong><br>${h(e.text)}</p>`).join('') : '<p>No cards acquired or retired this month.</p>'}</div>
    <div class="continue-row"><div class="turn-feedback" data-feedback-slot><p class="turn-hint">${nextEncounterText()}</p></div><button class="primary" data-action="begin">Continue to month ${pad(state.month + 1)} ${arrow}</button></div>`;
}

function nextEncounterText() {
  if (state.crisisWindow) return `Next: ${getCurrentCrisis(state)!.name}, response deadline Month ${state.crisisWindow.deadline}. A new hand replaces this one; Work does not carry over.`;
  return `Next: ${['Crisis', 'Cruise', 'Event'][(state.month + 1) % 3]}. Draw a new hand and reset to 1 Ops play / 1 Buy.`;
}



function pendingPanel() {
  const p = state.pending;
  if (!p) return '';
  const title = p.source === 'event' ? 'Event response' : cardById(p.source).name;
  let body = '';
  if (p.kind === 'retrieve') {
    const cards = state.discard.filter(c => !p.requiredTypes || p.requiredTypes.includes(cardById(c.id).type));
    body = `<p>Return up to ${p.max} ${p.requiredTypes ? p.requiredTypes.join(' or ') + ' ' : ''}cards from discard to hand. Played cards stay unavailable until cleanup.</p>
      <div class="hand-cards retrieval-cards">${cards.map(c => handCard(c, 'discard')).join('')}</div>
      <div class="selection-actions"><span>${selected.length} selected</span><button class="primary" data-action="confirm-selection">${selected.length ? `Retrieve ${selected.length}` : 'Retrieve no cards'}</button></div>`;
  } else if (p.kind === 'gain') {
    body = `<p>Choose ${p.requiredType === 'Ops' ? 'an Ops card' : 'a card'} costing up to ${p.maxCost} Work from the supply below. It goes to your discard pile, not your hand. This gain uses no Work or Buy.</p>`;
  } else if (p.kind === 'inspect') {
    const kept = p.cards.filter(c => (inspection[c.uid] || 'keep') === 'keep');
    if (reverseKept) kept.reverse();
    body = `<p>Keep returns a card to the top of your deck. Discard sets it aside until a shuffle. Retire removes it permanently and forfeits any Cargo points.</p><div class="inspect-cards">${p.cards.map(c => `<label data-inspect-card="${c.uid}" class="type-${cardById(c.id).type.toLowerCase()}"><strong>${h(cardById(c.id).name)}</strong><small>${h(cardById(c.id).type)} · ${h(cardById(c.id).text)}</small><select data-inspect="${c.uid}" aria-label="Disposition for ${h(cardById(c.id).name)}"><option value="keep" ${(inspection[c.uid] || 'keep') === 'keep' ? 'selected' : ''}>Keep on top</option><option value="discard" ${inspection[c.uid] === 'discard' ? 'selected' : ''}>Discard</option><option value="retire" ${inspection[c.uid] === 'retire' ? 'selected' : ''}>Retire permanently</option></select></label>`).join('')}</div><p class="microcopy">Next draw: ${kept.map(c => h(cardById(c.id).name)).join(' → ') || 'No inspected cards kept'}</p><div class="selection-actions">${kept.length > 1 ? '<button class="secondary" data-action="reverse">Reverse kept order</button>' : ''}<button class="primary" data-action="confirm-inspect">Confirm inspection</button></div>`;
  } else {
    const verb = p.kind === 'retire' ? 'Retire' : 'Discard';
    const quantity = p.min === p.max ? `exactly ${p.min}` : `up to ${p.max}`;
    const eligible = `${p.kind === 'retire' && p.requiredId ? cardById(p.requiredId).name + ' ' : p.kind === 'discard' && p.requiredTypes ? p.requiredTypes.join(' or ') + ' ' : p.kind === 'discard' && p.requiredType ? p.requiredType + ' ' : ''}${p.max === 1 ? 'card' : 'cards'}`;
    body = `<p>${verb} ${quantity} ${eligible} from your hand. ${p.kind === 'retire' ? `Retired cards leave permanently.${p.drawOnRetire ? ' Draw 2 cards if you retire a Crew Shift.' : ' Cargo loses its printed points.'}` : p.redraw ? `Draw ${p.drawPerCard === 2 ? 'two per discarded card' : 'the same number'} afterward. Discarded cards can return after a shuffle.` : 'No replacement cards are drawn. Discarded cards can return after a shuffle.'}</p><div class="selection-actions"><span>${selected.length} selected</span><button class="primary" data-action="confirm-selection" ${selected.length < p.min || selected.length > p.max ? 'disabled' : ''}>${selected.length < p.min ? `Select ${p.min - selected.length} more` : selected.length ? `${verb} ${selected.length} ${selected.length === 1 ? 'card' : 'cards'}` : p.kind === 'retire' ? 'Retire no cards' : 'Discard no cards'}</button></div>`;
  }
  return `<section class="pending-panel" tabindex="-1" aria-label="Resolve ${h(title)}"><p class="eyebrow">RESOLVE / ${h(title)}</p>${body}</section>`;
}

function handCard(card: CardInstance, zone: 'hand' | 'discard' = 'hand') {
  const def = cardById(card.id);
  const arrivalRule = def.text.slice(Math.max(0, def.text.indexOf('Arrival: ')));
  const rule = def.type === 'Burden' ? `Cannot be played. −1 secondary point. ${arrivalRule}`
    : def.type === 'Cargo' && state.arrival ? arrivalRule : def.text;
  const p = state.pending;
  const picking = p && (zone === 'discard' ? p.kind === 'retrieve' : p.kind === 'retire' || p.kind === 'discard');
  const eligible = picking && (p.kind !== 'retire' || !p.requiredId || card.id === p.requiredId) && (p.kind !== 'discard' || !p.requiredType || def.type === p.requiredType) && (!('requiredTypes' in p) || !p.requiredTypes || p.requiredTypes.includes(def.type));
  const limit = p && 'max' in p ? p.max : 0;
  const enabled = picking ? eligible && (selected.includes(card.uid) || selected.length < limit) : canPlayCard(state, card.uid);
  const label = picking ? selected.includes(card.uid) ? 'Selected' : eligible ? 'Select' : 'Ineligible' : enabled ? 'Play' : def.type === 'Cargo' ? state.arrival ? 'Use in Arrival panel' : `+${def.points} secondary points` : def.type === 'Burden' ? 'Arrival obligation · −1 point' : 'In hand';
  return `<button class="game-card type-${def.type.toLowerCase()} ${selected.includes(card.uid) ? 'selected' : ''}" data-card="${card.uid}" ${enabled ? '' : 'disabled'} ${picking ? `aria-pressed="${selected.includes(card.uid)}"` : ''} aria-label="${h(label)} ${h(def.name)}">
    <span class="card-top"><span>${def.type}</span><span>${def.cost} W</span></span><strong class="card-name">${h(def.name)}</strong><span class="card-rule">${h(rule)}</span><span class="card-bottom">${label}</span></button>`;
}

function handPanel() {
  if (!active()) return '';
  return `<section class="hand-section" aria-label="Your hand"><div class="hand-title"><div class="hand-heading"><h2 tabindex="-1">Your hand <span>${state.hand.length} ${state.hand.length === 1 ? 'card' : 'cards'}</span></h2>${state.phase === 'ops' ? `<span class="ops-count" data-counter="ops"><b>${state.ops}</b> Ops ${state.ops === 1 ? 'play' : 'plays'} left</span>` : ''}</div><div class="hand-zones"><span data-zone="draw">DRAW <b>${state.deck.length}</b></span><span data-zone="discard">DISCARD <b>${state.discard.length}</b></span><span>PLAYED <b>${state.inPlay.length}</b></span></div></div>
    ${pendingPanel()}<div class="hand-cards">${state.hand.length ? state.hand.map(card => handCard(card)).join('') : '<p class="empty-hand">No cards in hand. Finish the phase when ready.</p>'}</div>
    ${state.inPlay.length ? `<div class="in-play"><span class="eyebrow">IN PLAY</span><div class="played-cards">${state.inPlay.map(c => `<span class="played-card type-${cardById(c.id).type.toLowerCase()}" data-played-card="${c.uid}">${h(cardById(c.id).name)}</span>`).join('')}</div></div>` : ''}</section>`;
}

function supplyPreview(id: CardId) {
  const c = cardById(id);
  const gaining = state.pending?.kind === 'gain' ? state.pending : null;
  const enabled = gaining ? canAcquire(state, id, gaining.maxCost, gaining.requiredType) : canBuyCard(state, id);
  const restricted = c.type === 'Ops' && state.allowedOps && !state.allowedOps.includes(id);
  const reason = restricted ? 'Unavailable this month' : enabled ? gaining ? 'Gain card' : 'Acquire card' : gaining ? 'Outside gain limit' : state.phase !== 'buy' ? 'Acquire after playing your hand' : !state.buys ? 'No Buys remaining' : `Needs ${c.cost} Work`;
  return `<div class="supply-preview type-${c.type.toLowerCase()}" data-supply-card="${id}" aria-live="polite"><div class="card-top"><span>${c.type}</span><b>${c.cost} W</b></div><h3 class="card-name">${h(c.name)}</h3><p class="card-rule">${h(c.text)}</p><p class="card-flavor">${h(c.flavor)}</p>${state.phase === 'buy' && !gaining ? `<div class="acquisition-budget" aria-label="Acquisition budget"><span data-counter="work"><b>${state.work}</b> Work to spend</span><span class="buys-left" data-counter="buys"><b>${state.buys}</b> ${state.buys === 1 ? 'Buy' : 'Buys'} left</span></div>` : ''}<button class="primary" data-supply="${id}" ${enabled ? '' : 'disabled'} aria-label="${gaining ? 'Gain' : 'Acquire'} ${h(c.name)}">${gaining ? 'Gain card · free' : `Acquire card · ${c.cost} Work + 1 Buy`}</button>${enabled ? '' : `<p class="microcopy">${reason}</p>`}</div>`;
}

function supplyCards() {
  return CARDS.filter(c => c.type === supplyType && c.available !== false).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'en'));
}

function supplyPanel() {
  const gain = state.pending?.kind === 'gain' ? state.pending : null;
  return `<aside class="table-supply panel" aria-labelledby="supply-title"><div class="supply-heading"><p class="eyebrow">ONBOARD PREPARATIONS</p><h2 id="supply-title">Prepare the next hand.</h2><p class="microcopy">Choose a card to inspect. Acquired cards go to discard. W = Work.</p></div>
    ${gain ? `<p class="event-rule">${h(cardById(gain.source).name)}: gain ${gain.requiredType ? `an ${gain.requiredType} card` : 'a card'} costing up to ${gain.maxCost} Work. Uses no Work or Buy.</p>` : ''}
    <div class="supply-tabs" role="group" aria-label="Supply categories">${(['Work', 'Cargo', 'Ops'] as const).map(type => `<button data-supply-tab="${type}" aria-pressed="${supplyType === type}">${type}</button>`).join('')}</div>
    <label class="supply-select" for="supply-pick">Inspect a card<select id="supply-pick" data-supply-pick>${supplyCards().map(c => `<option value="${c.id}" ${selectedSupply === c.id ? 'selected' : ''}>${h(c.name)} · ${c.cost} Work${c.type === 'Ops' && state.allowedOps && !state.allowedOps.includes(c.id) ? ' · unavailable' : ''}</option>`).join('')}</select></label>
    <div class="supply-choices">${supplyCards().map(c => {
      const restricted = c.type === 'Ops' && state.allowedOps && !state.allowedOps.includes(c.id);
      return `<button class="supply-choice type-${c.type.toLowerCase()} ${restricted ? 'restricted' : ''}" data-preview="${c.id}" data-supply-card="${c.id}" aria-pressed="${selectedSupply === c.id}" aria-label="Inspect ${h(c.name)}, ${c.cost} Work${restricted ? ', unavailable this month' : ''}"><strong class="card-name">${h(c.name)}</strong><span class="choice-cost">${c.cost} W</span></button>`;
    }).join('')}</div>
    ${supplyPreview(selectedSupply)}
    ${state.allowedOps ? '<p class="restriction-note">Earth Political Shock: only the three permitted Ops can be acquired this month. Owned Ops still work.</p>' : ''}</aside>`;
}

function deckPanel(compact = false) {
  const cards = ownedCards(state);
  const score = getScore(state);
  const nextMonth = (Math.floor(state.month / 3) + 1) * 3;
  const nextCrisis = CRISES[(Math.ceil(nextMonth / 3) - 1) % CRISES.length];
  const inventoryCards = CARDS.filter(c => cards.some(instance => instance.id === c.id)).map(c => `<details class="inventory-card type-${c.type.toLowerCase()}"><summary><span>${h(c.name)}</span><b>×${cards.filter(instance => instance.id === c.id).length}</b></summary><p>${h(c.type)} · ${h(c.text)}</p></details>`).join('');
  if (compact) return `<aside class="table-manifest panel" aria-label="Your whole deck"><div class="manifest-heading"><h2>Your deck <span>${cards.length} cards</span></h2><span class="manifest-score">${score.total} secondary points</span></div><p class="manifest-caption">All owned cards, including deployed kits · click a name for rules</p><div class="manifest-card-list">${inventoryCards}</div>${nextMonth <= state.totalMonths ? `<p class="manifest-horizon"><strong>Next crisis · M${pad(nextMonth)}: ${h(nextCrisis.name)}</strong><span>${h(crisisTerms(nextCrisis))}</span></p>` : ''}</aside>`;
  return `<aside class="deck-panel panel" aria-label="Deck and voyage overview"><p class="eyebrow">WHAT WE CARRY</p><h2>${cards.length} cards. <span>${score.total} secondary points.</span></h2>
    <div class="deck-counts">${(['Work', 'Ops', 'Cargo', 'Burden'] as const).map(type => `<div class="type-${type.toLowerCase()}"><strong>${cards.filter(c => cardById(c.id).type === type).length}</strong><span>${type}</span></div>`).join('')}</div>
    <p class="microcopy">${score.cargo} Cargo points − ${score.burdens} unresolved Burdens.<br>Retired: ${state.retired.length}. Cargo scores its printed value.</p>
    ${state.phase !== 'arrived' && nextMonth <= state.totalMonths ? `<div class="next-crisis"><p class="eyebrow">ON THE HORIZON / MONTH ${pad(nextMonth)}</p><h3>${h(nextCrisis.name)}</h3><p>${h(crisisTerms(nextCrisis))}</p><p class="microcopy">Choose after playing Work, before acquiring cards. Consumed Cargo forfeits its points.</p></div>` : ''}
    <details class="inventory" ${inventoryOpen || state.phase === 'arrived' ? 'open' : ''}><summary>Inspect the whole deck</summary><div>${inventoryCards}</div></details>
    <p class="deck-footnote">Callisto is the foothold.<br>Europa is the reason.</p></aside>`;
}

function render(focus = false) {
  feedback.clear();
  const focused = document.activeElement as HTMLElement | null;
  const focusSelector = focused?.dataset.card ? `[data-card="${focused.dataset.card}"]` : focused?.dataset.supply ? `[data-supply="${focused.dataset.supply}"]` : focused?.dataset.inspect ? `[data-inspect="${focused.dataset.inspect}"]` : focused?.dataset.preview ? `[data-preview="${focused.dataset.preview}"]` : focused?.dataset.supplyTab ? `[data-supply-tab="${focused.dataset.supplyTab}"]` : focused?.dataset.tableView ? `[data-table-view="${focused.dataset.tableView}"]` : focused?.id === 'supply-pick' ? '#supply-pick' : '';
  const table = state.phase !== 'briefing' && state.phase !== 'arrived';
  app.innerHTML = `<header class="site-header ${table ? 'table-header' : ''}"><span class="wordmark"><span class="brand-orbit" aria-hidden="true">◉</span> JOVIAN<span>WAKE</span><small>0.5</small></span><div class="header-right"><span class="prototype-label">${state.phase === 'arrived' ? 'MISSION / DEBRIEF' : 'OPEN POOL / CRUISE + ARRIVAL'}</span>${soundButton()}<button class="text-button" data-action="restart">New voyage ↗</button></div></header>
    ${state.phase === 'arrived' ? renderArrivalDebrief(state) : `
    <main class="${table ? 'table-page' : ''}" data-phase="${state.phase}" data-month="${state.month}" data-view="${tableView}"><div class="mission-nav"><span>${state.arrival ? `JOVIAN ARRIVAL ${state.arrival.turn} / 4` : state.phase === 'arrival-ready' ? 'CRUISE COMPLETE · JOVIAN ARRIVAL' : table ? `MONTH ${pad(state.month)} / ${state.totalMonths} · ${state.encounter.kind.toUpperCase()}` : 'EXPEDITION CONTROL'}</span><span class="seed-display">SEED / ${h(state.seed)}</span></div>
    ${table ? `<div class="table-layout"><div class="table-flight-column"><section class="table-route" aria-label="Voyage progress"><div class="route-progress">${voyageTrack(true)}</div><span class="route-jupiter" aria-hidden="true"></span></section><section class="table-stage panel" aria-labelledby="dispatch-title">${state.phase === 'report' ? `<div class="table-encounter">${report()}</div>` : turnPanel()}${active() ? `<div class="table-view-switch" role="group" aria-label="Card table view"><button data-table-view="hand" aria-pressed="${tableView === 'hand'}">Hand · ${state.hand.length}</button><button data-table-view="supply" aria-pressed="${tableView === 'supply'}">${state.arrival || state.phase === 'arrival-ready' ? 'Arrival' : 'Supply'}</button><button data-table-view="deck" aria-pressed="${tableView === 'deck'}">Deck · ${ownedCards(state).length}</button></div>` : ''}${handPanel()}${active() ? phaseControls() : ''}</section>${deckPanel(true)}</div>${state.arrival || state.phase === 'arrival-ready' ? renderArrivalPanel(state) : supplyPanel()}</div>` : `${hero()}<div class="game-layout deck-layout"><section class="dispatch panel" aria-labelledby="dispatch-title">${briefing()}</section>${deckPanel()}</div>`}
    <div class="sr-only" aria-live="polite">${state.arrival ? `Arrival turn ${state.arrival.turn}` : `Month ${state.month}`}, ${state.phase} phase. ${state.ops} Ops, ${state.work} Work, ${state.buys} Buys.${state.pending ? ' A card choice is pending.' : ''} ${h(state.log.at(-1)?.title || '')}</div>
    <details class="voyage-log" ${logOpen ? 'open' : ''}><summary>VOYAGE LOG <span class="log-count">${state.log.length} ENTRIES</span></summary><div class="log-entries">${[...state.log].reverse().map(e => `<article><span class="log-month">${e.arrivalTurn ? `A${e.arrivalTurn}` : `M${pad(e.month)}`}</span><div><h3>${h(e.title)}</h3><p>${h(e.text)}</p></div></article>`).join('') || '<p>The voyage has yet to begin.</p>'}</div></details>
    <details class="how-to"><summary>Rules & card types</summary><p><strong>Work</strong> generates this month’s purchasing power. <strong>Ops</strong> spends one Ops play and resolves its card text; extra Ops lets you chain cards. <strong>Cargo</strong> has a secondary point value, supports cruise crises, and deploys during Arrival. <strong>Burden</strong> clogs your draws and costs 1 point at arrival if unresolved.</p><p>Play Ops first, then Work, respond to any crisis, then acquire cards. You cannot return to an earlier phase. Gained cards go to discard. When the draw pile runs out, shuffle the discard pile. Cleanup discards the entire hand and all cards in play; leftover Work, Ops, and Buys expire.</p><p>Retirement permanently removes a card and forfeits its points. Every owned Cargo card scores its printed value; each owned Burden subtracts 1 point. Score includes all owned piles. Every third month opens a two-month crisis response window; the final window closes in Month 24. Medical Isolation needs Colony Stores plus 2 Work, or a Habitation Modules kit. Paying Work reduces what you can buy. Cargo can be taken from any owned pile, using a copy in hand first, then discard, then draw. The 24-month mode repeats the four-crisis sequence. Some events automatically add a Burden after the opening draw. Acquisitions have no supply caps; they represent preparations using equipment already aboard.</p><p>The same seed, length, and choices reproduce a voyage. No saves across reloads. These are deliberately compressed gameplay timescales, not a trajectory simulation. Four arrival turns use the existing deck. Each stage needs fresh Work separately from persistent readiness. Matching deployed Cargo reduces its stage demand by 1 per kit, maximum 2. Cargo in hand can deploy or be cannibalized. Named Burdens affect arrival requirements. The old colony trial is disabled; Phase 1 preparation is not implemented.</p></details>
    <footer><span>JOVIAN WAKE <b>/</b> PROTOTYPE 0.5</span><span>THE DISTANCE IS THE TEST.</span></footer></main>`}
    <dialog id="restart-dialog" aria-labelledby="restart-title"><form id="restart-form"><p class="eyebrow">A DIFFERENT CROSSING</p><h2 id="restart-title">Chart a new voyage.</h2><p>${state.month && state.phase !== 'arrived' ? 'This will end your current run. ' : ''}Use the same seed to replay the same starting conditions.</p><label class="seed-label" for="restart-seed">VOYAGE SEED<input id="restart-seed" maxlength="80" required value="${h(state.seed)}" autocomplete="off" spellcheck="false"></label><div class="dialog-actions"><button type="button" class="text-button" data-action="random-seed">Generate seed ↺</button><div><button type="button" class="secondary" data-action="cancel-restart">Cancel</button><button type="submit" class="primary">Begin again ↗</button></div></div></form></dialog>`;
  app.querySelector<HTMLDetailsElement>('.voyage-log')?.addEventListener('toggle', e => { logOpen = (e.target as HTMLDetailsElement).open; });
  app.querySelector<HTMLDetailsElement>('.inventory')?.addEventListener('toggle', e => { inventoryOpen = (e.target as HTMLDetailsElement).open; });
  if (focus) app.querySelector<HTMLElement>('#dispatch-title')?.focus({ preventScroll: table });
  else if (focusSelector) {
    const previous = app.querySelector<HTMLElement>(focusSelector);
    const target = previous && !previous.matches(':disabled') ? previous : app.querySelector<HTMLElement>('.pending-panel, .hand-title h2');
    target?.focus({ preventScroll: true });
  }
}

function update(next: GameState, focus = false) {
  if (next === state) return;
  const before = state;
  const views = feedback.capture();
  state = next;
  if (next.month !== before.month || next.arrival?.turn !== before.arrival?.turn || ['arrival-report', 'arrival-ready'].includes(next.phase)) tableView = 'hand';
  else if (next.phase === 'arrival' && before.phase !== 'arrival') tableView = 'supply';
  else if (next.pending?.kind === 'retrieve') tableView = 'hand';
  else if (next.pending?.kind === 'gain' || (next.phase === 'buy' && before.phase !== 'buy')) tableView = 'supply';
  else if (before.pending && !next.pending && next.phase !== 'buy') tableView = 'hand';
  if (next.pending?.kind === 'gain') {
    const gain = next.pending;
    if (gain.requiredType) supplyType = gain.requiredType as typeof supplyType;
    const eligible = supplyCards().find(c => canAcquire(next, c.id, gain.maxCost, gain.requiredType));
    if (eligible) selectedSupply = eligible.id;
  }
  selected = [];
  inspection = {};
  reverseKept = false;
  render(focus);
  if (!feedback.show(before, state, views)) sound.play(state.pending ? 'tap' : 'confirm');
}

function reset(seed: string) {
  feedback.clear();
  state = createGame(seed.trim().slice(0, 80) || randomSeed());
  selected = [];
  inspection = {};
  reverseKept = false;
  logOpen = false;
  inventoryOpen = false;
  supplyType = 'Work';
  selectedSupply = 'specialist-shift';
  tableView = 'hand';
  const url = new URL(location.href);
  url.searchParams.set('seed', state.seed);
  url.searchParams.delete('months');
  history.replaceState(null, '', url);
  render(true);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

app.addEventListener('click', e => {
  const target = e.target as Element;
  if (target.closest('summary')) { sound.play('tap'); return; }
  const button = target.closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  if (button.dataset.action === 'sound') {
    sound.toggle();
    button.outerHTML = soundButton();
    app.querySelector<HTMLButtonElement>('[data-action="sound"]')?.focus({ preventScroll: true });
    sound.play('tap');
    return;
  }

  if (button.dataset.arrivalDemand) { update(payArrivalDemand(state, Number(button.dataset.arrivalDemand))); return; }
  if (button.dataset.arrivalObjective) { update(commitArrivalWork(state, button.dataset.arrivalObjective as ArrivalObjective, Number(button.dataset.amount))); return; }
  if (button.dataset.arrivalCargo) { update(useArrivalCargo(state, Number(button.dataset.arrivalCargo), button.dataset.cargoAction as 'deploy' | 'sacrifice')); return; }
  if (button.dataset.card) {
    const uid = Number(button.dataset.card);
    if (state.pending?.kind === 'retire' || state.pending?.kind === 'discard' || state.pending?.kind === 'retrieve') {
      selected = selected.includes(uid) ? selected.filter(n => n !== uid) : [...selected, uid];
      render();
      sound.play('tap');
    } else update(playCard(state, uid));
    return;
  }
  if (button.dataset.preview) {
    selectedSupply = button.dataset.preview as CardId;
    render();
    sound.play('tap');
    return;
  }
  if (button.dataset.supplyTab) {
    supplyType = button.dataset.supplyTab as typeof supplyType;
    selectedSupply = supplyType === 'Work' ? 'specialist-shift' : supplyCards()[0].id;
    render();
    sound.play('tap');
    return;
  }
  if (button.dataset.tableView) {
    tableView = button.dataset.tableView as typeof tableView;
    render();
    sound.play('tap');
    return;
  }
  if (button.dataset.supply) {
    const id = button.dataset.supply as CardId;
    update(state.pending?.kind === 'gain' ? resolveChoice(state, { type: 'gain', cardId: id }) : buyCard(state, id));
    return;
  }
  const dialog = app.querySelector<HTMLDialogElement>('#restart-dialog')!;
  switch (button.dataset.action) {
    case 'arrival-begin': update(beginArrivalTurn(state), true); break;
    case 'arrival-end': update(endArrivalTurn(state), true); break;
    case 'begin': {
      if (state.phase === 'briefing') reset(app.querySelector<HTMLInputElement>('#launch-seed')!.value);
      update(beginMonth(state), true);
      break;
    }
    case 'work': update(advancePhase(playAllWork(advancePhase(state))), !!getCurrentCrisis(state)); break;
    case 'all-work': update(advancePhase(playAllWork(state)), !!getCurrentCrisis(state)); break;
    case 'crisis-work': update(resolveCrisis(state, 'work'), true); break;
    case 'crisis-defer': update(resolveCrisis(state, 'defer'), true); break;
    case 'crisis-wait': update(resolveCrisis(state, 'wait'), true); break;
    case 'crisis-cargo': update(resolveCrisis(state, 'cargo', button.dataset.cargoId as CardId), true); break;
    case 'end': update(endMonth(state), true); break;
    case 'event-discard': update(respondToEvent(state, 'discard')); break;
    case 'event-burden': update(respondToEvent(state, 'burden')); break;
    case 'confirm-selection': update(resolveChoice(state, { type: 'cards', uids: selected })); break;
    case 'confirm-inspect': {
      if (state.pending?.kind !== 'inspect') break;
      const cards = state.pending.cards;
      const ofKind = (kind: string) => cards.filter(c => (inspection[c.uid] || 'keep') === kind).map(c => c.uid);
      const keep = ofKind('keep');
      if (reverseKept) keep.reverse();
      update(resolveChoice(state, { type: 'inspect', retire: ofKind('retire'), discard: ofKind('discard'), keep }));
      break;
    }
    case 'reverse': reverseKept = !reverseKept; render(); sound.play('tap'); break;
    case 'restart':
    case 'new': dialog.showModal(); app.querySelector<HTMLInputElement>('#restart-seed')!.value = randomSeed(); sound.play('tap'); break;
    case 'replay': reset(state.seed); sound.play('confirm'); break;
    case 'cancel-restart': dialog.close(); sound.play('cancel'); break;
    case 'random-seed': app.querySelector<HTMLInputElement>('#restart-seed')!.value = randomSeed(); sound.play('tap'); break;
  }
});

app.addEventListener('change', e => {
  const input = e.target as HTMLSelectElement;
  if (input.id === 'supply-pick') {
    selectedSupply = input.value as CardId;
    render();
    sound.play('tap');
  } else if (input.dataset.inspect) {
    inspection[Number(input.dataset.inspect)] = input.value as 'keep' | 'discard' | 'retire';
    render();
    sound.play('tap');
  }
});

app.addEventListener('submit', e => {
  if ((e.target as HTMLElement).id !== 'restart-form') return;
  e.preventDefault();
  reset(app.querySelector<HTMLInputElement>('#restart-seed')!.value);
  sound.play('confirm');
});

render();
document.addEventListener('visibilitychange', () => { if (document.hidden) feedback.clear(); });

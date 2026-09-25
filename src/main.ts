import './style.css';
import { CARDS, CRISES, CRISIS_POINTS } from './content.ts';
import {
  advancePhase, beginMonth, buyCard, canAcquire, canBuyCard, canPlayCard, cardById,
  createGame, endMonth, getCurrentCrisis, getCurrentEvent, getScore, ownedCards,
  playAllWork, playCard, resolveChoice, respondToEvent,
} from './engine.ts';
import type { CardId, CardInstance, GameState } from './types.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
let state = createGame(params.get('seed')?.trim().slice(0, 80) || 'CALLISTO-01', params.get('months') === '24' ? 24 : 12);
let selected: number[] = [];
let inspection: Record<number, 'keep' | 'discard' | 'retire'> = {};
let reverseKept = false;
let logOpen = false;
let inventoryOpen = false;
const h = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pad = (n: number) => String(n).padStart(2, '0');
const active = () => ['event', 'ops', 'work', 'buy'].includes(state.phase);
const randomSeed = () => `CALLISTO-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;
const arrow = '<span aria-hidden="true">↗</span>';

function hero() {
  return `<section class="hero ${state.month ? 'cruising' : ''}" aria-label="Voyage progress">
    <div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> ${state.phase === 'arrived' ? 'CALLISTO / ARRIVAL' : 'ONE WAY / JOVIAN SYSTEM'}</p>
    <h1>${state.month === 0 ? 'The long way out.' : state.phase === 'arrived' ? 'What did we bring?' : 'Make the next hand count.'}</h1>
    <p class="hero-description">30 people. ${state.totalMonths} months. Everything we have is on this ship.</p>
    <div class="journey-labels"><span>EARTH</span><span>MONTH ${pad(state.month)} / ${state.totalMonths}</span><span>CALLISTO</span></div>
    <div class="journey-track">${Array.from({ length: state.totalMonths }, (_, i) => `<i class="${i < state.month ? 'passed' : ''} ${i % 3 === 2 ? 'crisis-mark' : ''}" title="Month ${i + 1}: ${['Cruise', 'Event', 'Crisis'][i % 3]}"></i>`).join('')}</div></div>
    <div class="space-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="planet"></div><div class="moon"></div><span class="planet-label">JUPITER SYSTEM<br><b>05.2 AU · SOL</b></span><span class="schematic">ARTIST’S IMPRESSION</span></div>
  </section>`;
}

function briefing() {
  return `<p class="eyebrow">CAPTAIN’S BRIEFING / DECKBUILDING EXPERIMENT</p><h2 id="dispatch-title" tabindex="-1">There is no resupply.</h2>
    <p class="dispatch-body">Life beneath Europa’s ice. A foothold on Callisto. Thirty people carrying everything they need across the dark. Build the crew’s routines and decide what arrives with you.</p>
    <ol class="briefing-steps">
      <li><span>01</span><div><strong>Draw five. Start with 1 Ops and 1 Buy.</strong><p>Play Ops for effects, then Work to prepare new cards. Acquired cards go to your discard pile and return after a shuffle.</p></div></li>
      <li><span>02</span><div><strong>Cruise → Event → Crisis. Repeat.</strong><p>Every third month tests your deck. Meet the displayed target for +${CRISIS_POINTS} points; otherwise gain one Burden and continue.</p></div></li>
      <li><span>03</span><div><strong>Bring something worth keeping.</strong><p>Cargo scores its printed points at arrival. Build enough Work to prepare more valuable Cargo, or retire it to improve your draws and forfeit those points. Burdens just take up space.</p></div></li>
    </ol>
    <div class="launch-controls"><label class="seed-label" for="launch-seed">VOYAGE SEED<input id="launch-seed" maxlength="80" value="${h(state.seed)}" autocomplete="off" spellcheck="false"></label>
    <label class="seed-label" for="launch-months">LENGTH<select id="launch-months"><option value="12" ${state.totalMonths === 12 ? 'selected' : ''}>12 months · quick test</option><option value="24" ${state.totalMonths === 24 ? 'selected' : ''}>24 months · longer build</option></select></label>
    <button class="primary" data-action="begin">Begin the cruise ${arrow}</button></div>
    <p class="microcopy">Starting deck: 7 Crew Shift, 3 Colony Stores. No timer. Reloading resets the voyage.</p>`;
}

function crisisTargets() {
  const crisis = getCurrentCrisis(state);
  if (!crisis) return '';
  return `<div class="crisis-targets" aria-label="Crisis targets"><span class="${state.workGenerated >= crisis.requiredWork ? 'met' : ''}">Work generated <b>${state.workGenerated} / ${crisis.requiredWork}</b></span>${crisis.requiredOps ? `<span class="${state.opsPlayed >= crisis.requiredOps ? 'met' : ''}">Ops played <b>${state.opsPlayed} / ${crisis.requiredOps}</b></span>` : ''}</div><p class="microcopy">${crisis.requiredOps ? 'Both targets' : 'The target'} must be met when the month ends. Spent Work still counts. Success +${CRISIS_POINTS} points; failure adds ${h(cardById(crisis.burden).name)}.</p>`;
}

function turnPanel() {
  const event = getCurrentEvent(state);
  const crisis = getCurrentCrisis(state);
  return `<div class="dispatch-header"><span class="eyebrow">MONTH ${pad(state.month)} / ${state.encounter.kind.toUpperCase()}</span><span class="status-tag">${state.totalMonths - state.month} MONTHS AFTER THIS</span></div>
    <h2 id="dispatch-title" tabindex="-1">${h(crisis?.name || event?.name || 'Room to work.')}</h2>
    <p class="dispatch-body">${h(crisis?.description || event?.description || 'No new fault has the crew’s attention. Use this month to strengthen the routines you will need later.')}</p>
    ${event ? `<p class="event-rule">${h(event.rule)}</p>` : ''}
    ${crisisTargets()}
    ${state.phase === 'event' && event?.effect.kind === 'discard-or-burden' ? eventDecision(event.effect) : ''}
    ${phaseControls()}`;
}

function eventDecision(effect: { count: number; cardType?: string; burden: CardId }) {
  const eligible = state.hand.filter(c => !effect.cardType || cardById(c.id).type === effect.cardType).length;
  return `<div class="event-actions"><button class="secondary" data-action="event-discard" ${state.pending || eligible < effect.count ? 'disabled' : ''}>Discard ${effect.count} ${effect.cardType || 'cards'}</button><button class="secondary" data-action="event-burden" ${state.pending ? 'disabled' : ''}>Gain ${h(cardById(effect.burden).name)}</button></div>${eligible < effect.count ? '<p class="microcopy">You do not have enough eligible cards to pay the discard cost.</p>' : ''}`;
}

function phaseControls() {
  const phase = state.phase;
  return `<nav class="phase-strip" aria-label="Monthly sequence">${[['ops', '1 · Ops'], ['work', '2 · Work'], ['buy', '3 · Acquire']].map(([key, label]) => `<span ${key === phase ? 'aria-current="step"' : ''}>${label}</span>`).join('<i aria-hidden="true">→</i>')}</nav>
    <div class="turn-actions">
    ${phase === 'ops' ? `<p>${state.ops ? state.hand.some(c => cardById(c.id).type === 'Ops') ? `${state.ops} Ops remaining. Click an Ops card to play it.` : 'No Ops cards in hand. Play Work to acquire new cards.' : 'No Ops remaining. Move on to Work.'}</p><button class="primary" data-action="work" ${state.pending ? 'disabled' : ''}>${state.ops && state.hand.some(c => cardById(c.id).type === 'Ops') ? 'Finish Ops & play Work' : 'Play Work'} ${arrow}</button>` : ''}
    ${phase === 'work' ? `<p>Play your Work cards, then acquire cards.</p><button class="primary" data-action="all-work" ${state.pending ? 'disabled' : ''}>Play all Work & acquire ${arrow}</button>` : ''}
    ${phase === 'buy' ? `<p>${state.buys ? `Choose a supply pile below. ${state.buys} ${state.buys === 1 ? 'Buy' : 'Buys'} remaining.` : 'No Buys remaining. This month is ready to close.'}</p><button class="primary" data-action="end" ${state.pending ? 'disabled' : ''}>End month ${pad(state.month)} ${arrow}</button>` : ''}
    ${phase === 'event' ? '<p>Resolve the event before playing your hand.</p>' : ''}</div>${mobileHorizon()}`;
}

function mobileHorizon() {
  const nextMonth = (Math.floor(state.month / 3) + 1) * 3;
  const crisis = CRISES[(nextMonth / 3 - 1) % CRISES.length];
  return nextMonth <= state.totalMonths ? `<p class="mobile-horizon">Next crisis · M${pad(nextMonth)}: ${h(crisis.name)}. ${crisis.requiredWork} Work${crisis.requiredOps ? ` + ${crisis.requiredOps} Ops` : ''}; opening hand ${crisis.handSize}.</p>` : '';
}

function report() {
  const result = state.crisisResults.find(r => r.month === state.month);
  const entries = state.log.filter(e => e.month === state.month && ['purchase', 'retirement', 'crisis'].includes(e.kind));
  return `<p class="eyebrow">MONTH ${pad(state.month)} / LOG RECORDED</p><h2 id="dispatch-title" tabindex="-1">${result ? result.success ? 'The system holds.' : 'A workaround will have to do.' : 'A month behind us.'}</h2>
    <p class="dispatch-body">${result ? result.success ? `Crisis cleared. +${CRISIS_POINTS} arrival points.` : 'One Burden joins the deck. The crew contains the fault; the crossing continues.' : 'The hand is discarded. Work and unused Ops do not carry forward.'}</p>
    <div class="report-entries">${entries.length ? entries.map(e => `<p><strong>${h(e.title)}</strong><br>${h(e.text)}</p>`).join('') : '<p>No cards acquired or retired this month.</p>'}</div>
    <div class="continue-row"><p>${nextEncounterText()}</p><button class="primary" data-action="begin">Continue to month ${pad(state.month + 1)} ${arrow}</button></div>`;
}

function nextEncounterText() {
  return `Next: ${['Crisis', 'Cruise', 'Event'][(state.month + 1) % 3]}. Draw a new hand and reset to 1 Ops / 1 Buy.`;
}

function arrival() {
  const score = getScore(state);
  const burdens = ownedCards(state).filter(c => cardById(c.id).type === 'Burden').length;
  const cargoCount = ownedCards(state).filter(c => cardById(c.id).type === 'Cargo').length;
  return `<p class="eyebrow">MONTH ${state.totalMonths} / ARRIVAL ASSESSMENT</p><h2 id="dispatch-title" tabindex="-1">You brought them this far.</h2>
    <p class="dispatch-body">Callisto fills the forward cameras. The crossing ends here. The routines you built, the stores you protected, and the work you deferred have all arrived with you.</p>
    <div class="arrival-score"><strong>${score.total}</strong><div><span class="eyebrow">ARRIVAL POINTS</span><p>${score.cargo} Cargo + ${score.crises} from crises</p></div></div>
    <div class="arrival-assessment"><div><h3>${state.crisisResults.filter(r => r.success).length} / ${state.crisisResults.length} crises cleared</h3><p>${burdens} Burden${burdens === 1 ? '' : 's'} remain in the deck.</p></div><div><h3>${cargoCount} Cargo ${cargoCount === 1 ? 'card' : 'cards'} · ${score.cargo} points</h3><p>${state.retired.length} cards retired during the crossing. Retired Cargo no longer scores.</p></div></div>
    <div class="crisis-history">${state.crisisResults.map(r => `<p><span>M${pad(r.month)}</span><strong>${h(CRISES.find(c => c.id === r.id)!.name)}</strong><span class="${r.success ? 'success-text' : ''}">${r.success ? `Cleared +${CRISIS_POINTS}` : 'Contained · +1 Burden'}</span></p>`).join('')}</div>
    <div class="end-actions"><button class="primary" data-action="new">Chart another voyage ${arrow}</button><button class="text-button" data-action="replay">Replay this seed ↺</button></div>
    <p class="microcopy">Prototype 0.2. Can a different deck beat this score? Settlement and Europa operations are beyond this voyage.</p>`;
}

function pendingPanel() {
  const p = state.pending;
  if (!p) return '';
  const title = p.source === 'event' ? 'Event response' : cardById(p.source).name;
  let body = '';
  if (p.kind === 'gain') {
    body = `<p>Choose ${p.requiredType === 'Ops' ? 'an Ops' : 'a card'} costing up to ${p.maxCost} from the supply below. This gain uses no Work or Buy.</p>`;
  } else if (p.kind === 'inspect') {
    const kept = p.cards.filter(c => (inspection[c.uid] || 'keep') === 'keep');
    if (reverseKept) kept.reverse();
    body = `<p>Choose what happens to each card. Kept cards return to the top of your deck.</p><div class="inspect-cards">${p.cards.map(c => `<label><strong>${h(cardById(c.id).name)}</strong><select data-inspect="${c.uid}" aria-label="Disposition for ${h(cardById(c.id).name)}"><option value="keep" ${(inspection[c.uid] || 'keep') === 'keep' ? 'selected' : ''}>Keep on top</option><option value="discard" ${inspection[c.uid] === 'discard' ? 'selected' : ''}>Discard</option><option value="retire" ${inspection[c.uid] === 'retire' ? 'selected' : ''}>Retire permanently</option></select></label>`).join('')}</div><p class="microcopy">Next draw: ${kept.map(c => h(cardById(c.id).name)).join(' → ') || 'No inspected cards kept'}</p><div class="selection-actions">${kept.length > 1 ? '<button class="secondary" data-action="reverse">Reverse kept order</button>' : ''}<button class="primary" data-action="confirm-inspect">Confirm inspection</button></div>`;
  } else {
    const verb = p.kind === 'retire' ? 'Retire' : 'Discard';
    const quantity = p.min === p.max ? `exactly ${p.min}` : `up to ${p.max}`;
    const eligible = p.kind === 'discard' && p.requiredType ? `${p.requiredType} cards` : 'cards';
    body = `<p>${verb} ${quantity} ${eligible} from your hand. ${p.kind === 'retire' ? 'Retired cards leave the deck permanently; Cargo loses its printed points.' : p.redraw ? 'Draw the same number afterward.' : 'Then begin the normal turn.'}</p><div class="selection-actions"><span>${selected.length} selected</span><button class="primary" data-action="confirm-selection" ${selected.length < p.min || selected.length > p.max ? 'disabled' : ''}>${selected.length ? `${verb} ${selected.length} ${selected.length === 1 ? 'card' : 'cards'}` : p.kind === 'retire' ? 'Retire no cards' : 'Discard no cards'}</button></div>`;
  }
  return `<section class="pending-panel" tabindex="-1" aria-label="Resolve ${h(title)}"><p class="eyebrow">RESOLVE / ${h(title)}</p>${body}</section>`;
}

function handCard(card: CardInstance) {
  const def = cardById(card.id);
  const p = state.pending;
  const picking = p?.kind === 'retire' || p?.kind === 'discard';
  const eligible = picking && (p.kind !== 'discard' || !p.requiredType || def.type === p.requiredType);
  const enabled = picking ? eligible && (selected.includes(card.uid) || selected.length < p.max) : canPlayCard(state, card.uid);
  const label = picking ? selected.includes(card.uid) ? 'Selected' : eligible ? 'Select' : 'Ineligible' : enabled ? 'Play' : def.type === 'Cargo' ? `+${def.points} arrival ${def.points === 1 ? 'point' : 'points'}` : def.type === 'Burden' ? 'No effect' : 'In hand';
  return `<button class="game-card type-${def.type.toLowerCase()} ${selected.includes(card.uid) ? 'selected' : ''}" data-card="${card.uid}" ${enabled ? '' : 'disabled'} ${picking ? `aria-pressed="${selected.includes(card.uid)}"` : ''} aria-label="${h(label)} ${h(def.name)}">
    <span class="card-top"><span>${def.type}</span><span>${def.cost} W</span></span><strong class="card-name">${h(def.name)}</strong><span class="card-rule">${h(def.text)}</span><span class="card-bottom">${label}</span></button>`;
}

function handPanel() {
  if (!active()) return '';
  return `<section class="hand-section" aria-label="Your hand"><div class="hand-title"><h2 tabindex="-1">Your hand <span>${state.hand.length} ${state.hand.length === 1 ? 'card' : 'cards'}</span></h2><span class="microcopy">DRAW ${state.deck.length} · DISCARD ${state.discard.length} · IN PLAY ${state.inPlay.length}</span></div>
    ${pendingPanel()}<div class="hand-cards">${state.hand.length ? state.hand.map(handCard).join('') : '<p class="empty-hand">No cards in hand. Finish the phase when ready.</p>'}</div>
    ${state.inPlay.length ? `<p class="in-play"><span class="eyebrow">IN PLAY</span> ${state.inPlay.map(c => h(cardById(c.id).name)).join(' · ')}</p>` : ''}</section>`;
}

function supplyCard(id: CardId) {
  const c = cardById(id);
  const gaining = state.pending?.kind === 'gain' ? state.pending : null;
  const enabled = gaining ? canAcquire(state, id, gaining.maxCost, gaining.requiredType) : canBuyCard(state, id);
  const count = state.supply[id] || 0;
  const restricted = c.type === 'Ops' && state.allowedOps && !state.allowedOps.includes(id);
  const reason = !count ? 'Pile empty' : restricted ? 'Unavailable this month' : enabled ? gaining ? 'Gain card' : 'Acquire card' : `${count} remaining`;
  return `<button class="supply-card type-${c.type.toLowerCase()} ${restricted ? 'restricted' : ''}" data-supply="${id}" ${enabled ? '' : 'disabled'} aria-label="${gaining ? 'Gain' : 'Acquire'} ${h(c.name)}, cost ${c.cost} Work, ${count} remaining"><span class="card-top"><span>${c.type}</span><b>${c.cost} W</b></span><strong class="card-name">${h(c.name)}</strong><span class="card-rule">${h(c.text)}</span><span class="card-flavor">${h(c.flavor)}</span><span class="card-bottom">${reason}${enabled ? ` · ${count} left` : ''}</span></button>`;
}

function supplyPanel() {
  if (state.phase === 'arrived') return '';
  return `<section class="supply-section" aria-labelledby="supply-title"><div class="section-heading"><div><p class="eyebrow">FIXED SUPPLY</p><h2 id="supply-title">Prepare what comes next.</h2></div><p>Acquisition spends crew time on training, fabrication, and preparing stores. New cards enter your discard pile.</p></div>
    ${state.allowedOps ? '<p class="restriction-note">Earth Political Shock: only the three highlighted Ops piles can be bought or gained this month. Owned Ops still work.</p>' : ''}
    <div class="supply-basics">${CARDS.filter(c => c.type === 'Work' || c.type === 'Cargo').map(c => supplyCard(c.id)).join('')}</div>
    <div class="supply-ops">${CARDS.filter(c => c.type === 'Ops').map(c => supplyCard(c.id)).join('')}</div></section>`;
}

function deckPanel() {
  const cards = ownedCards(state);
  const score = getScore(state);
  const nextMonth = (Math.floor(state.month / 3) + 1) * 3;
  const nextCrisis = CRISES[(Math.ceil(nextMonth / 3) - 1) % CRISES.length];
  return `<aside class="deck-panel panel" aria-label="Deck and voyage overview"><p class="eyebrow">WHAT WE CARRY</p><h2>${cards.length} cards. <span>${score.total} points.</span></h2>
    <div class="deck-counts">${(['Work', 'Ops', 'Cargo', 'Burden'] as const).map(type => `<div class="type-${type.toLowerCase()}"><strong>${cards.filter(c => cardById(c.id).type === type).length}</strong><span>${type}</span></div>`).join('')}</div>
    <p class="microcopy">${score.cargo} Cargo points + ${score.crises} crisis points.<br>Retired: ${state.retired.length}. Cargo scores its printed value.</p>
    ${state.phase !== 'arrived' && nextMonth <= state.totalMonths ? `<div class="next-crisis"><p class="eyebrow">ON THE HORIZON / MONTH ${pad(nextMonth)}</p><h3>${h(nextCrisis.name)}</h3><p>Generate ${nextCrisis.requiredWork} Work${nextCrisis.requiredOps ? ` and play ${nextCrisis.requiredOps} Ops` : ''}.<br>Opening hand: ${nextCrisis.handSize} cards.</p><p class="microcopy">Scheduled targets are visible so you can build toward them.</p></div>` : ''}
    <details class="inventory" ${inventoryOpen || state.phase === 'arrived' ? 'open' : ''}><summary>Inspect the whole deck</summary><div>${CARDS.filter(c => cards.some(instance => instance.id === c.id)).map(c => `<p><span>${h(c.name)}</span><b>${cards.filter(instance => instance.id === c.id).length}</b></p>`).join('')}</div></details>
    <p class="deck-footnote">Callisto is the foothold.<br>Europa is the reason.</p></aside>`;
}

function counters() {
  if (!active()) return '';
  return `<section class="turn-counters" aria-label="Turn resources">${[['Ops remaining', state.ops], ['Work to spend', state.work], ['Buys remaining', state.buys], ['Work generated', state.workGenerated]].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</section>`;
}

function purchaseDock() {
  if (state.phase !== 'buy') return '';
  const lastGain = state.log.filter(e => e.month === state.month && e.kind === 'purchase').at(-1);
  return `<div class="purchase-dock" aria-label="Acquisition controls"><div><strong>M${pad(state.month)} · ${state.work} Work · ${state.buys} ${state.buys === 1 ? 'Buy' : 'Buys'}</strong><p>${lastGain ? h(lastGain.title) : 'Acquired cards go to discard.'}</p></div><button class="primary" data-action="end">Close month ${arrow}</button></div>`;
}

function render(focus = false) {
  const focused = document.activeElement as HTMLElement | null;
  const focusSelector = focused?.dataset.card ? `[data-card="${focused.dataset.card}"]` : focused?.dataset.supply ? `[data-supply="${focused.dataset.supply}"]` : focused?.dataset.inspect ? `[data-inspect="${focused.dataset.inspect}"]` : '';
  app.innerHTML = `<header class="site-header"><span class="wordmark"><span class="brand-orbit" aria-hidden="true">◉</span> JOVIAN<span>WAKE</span><small>0.2</small></span><div class="header-right"><span class="prototype-label">A CRUISE DECKBUILDER</span><button class="text-button" data-action="restart">New voyage ↗</button></div></header>
    <main data-phase="${state.phase}" data-month="${state.month}"><div class="mission-nav"><span>EXPEDITION CONTROL</span><span class="seed-display">SEED / ${h(state.seed)}</span></div>${hero()}${counters()}
    <div class="game-layout deck-layout"><div class="main-column"><section class="dispatch panel" aria-labelledby="dispatch-title">${state.phase === 'briefing' ? briefing() : state.phase === 'report' ? report() : state.phase === 'arrived' ? arrival() : turnPanel()}</section>${handPanel()}</div>${deckPanel()}</div>
    <div class="sr-only" aria-live="polite">Month ${state.month}, ${state.phase} phase. ${state.ops} Ops, ${state.work} Work, ${state.buys} Buys.${state.pending ? ' A card choice is pending.' : ''} ${h(state.log.at(-1)?.title || '')}</div>
    ${supplyPanel()}
    <details class="voyage-log" ${logOpen ? 'open' : ''}><summary>VOYAGE LOG <span class="log-count">${state.log.length} ENTRIES</span></summary><div class="log-entries">${[...state.log].reverse().map(e => `<article><span class="log-month">M${pad(e.month)}</span><div><h3>${h(e.title)}</h3><p>${h(e.text)}</p></div></article>`).join('') || '<p>The voyage has yet to begin.</p>'}</div></details>
    <details class="how-to"><summary>Rules & card types</summary><p><strong>Work</strong> generates this month’s purchasing power. <strong>Ops</strong> spends one Ops play and resolves its card text; extra Ops lets you chain cards. <strong>Cargo</strong> does nothing in hand and scores at arrival. <strong>Burden</strong> has no effect and clogs your draws.</p><p>Play Ops first, then Work, then acquire cards. You cannot return to an earlier phase. Gained cards go to discard. When the draw pile runs out, shuffle the discard pile. Cleanup discards the entire hand and all cards in play; leftover Work, Ops, and Buys expire.</p><p>Retirement permanently removes a card and forfeits its points. Every Cargo card still owned at arrival scores its printed value; cleared crises score ${CRISIS_POINTS} each. Score includes all owned piles. Every third month is one crisis attempt; failure adds one Burden and the voyage continues. Work already spent still counts toward its target. The 24-month mode repeats the four-crisis sequence.</p><p>The same seed, length, and choices reproduce a voyage. No saves across reloads. These are deliberately compressed gameplay timescales, not a trajectory simulation. No colony phase or ship upgrades yet.</p></details>
    <footer><span>JOVIAN WAKE <b>/</b> PROTOTYPE 0.2</span><span>THE DISTANCE IS THE TEST.</span></footer></main>${purchaseDock()}
    <dialog id="restart-dialog" aria-labelledby="restart-title"><form id="restart-form"><p class="eyebrow">A DIFFERENT CROSSING</p><h2 id="restart-title">Chart a new voyage.</h2><p>${state.month && state.phase !== 'arrived' ? 'This will end your current run. ' : ''}Use the same seed to replay the same starting conditions.</p><label class="seed-label" for="restart-seed">VOYAGE SEED<input id="restart-seed" maxlength="80" required value="${h(state.seed)}" autocomplete="off" spellcheck="false"></label><label class="seed-label" for="restart-months">LENGTH<select id="restart-months"><option value="12" ${state.totalMonths === 12 ? 'selected' : ''}>12 months</option><option value="24" ${state.totalMonths === 24 ? 'selected' : ''}>24 months</option></select></label><div class="dialog-actions"><button type="button" class="text-button" data-action="random-seed">Generate seed ↺</button><div><button type="button" class="secondary" data-action="cancel-restart">Cancel</button><button type="submit" class="primary">Begin again ↗</button></div></div></form></dialog>`;
  app.querySelector<HTMLDetailsElement>('.voyage-log')!.addEventListener('toggle', e => { logOpen = (e.target as HTMLDetailsElement).open; });
  app.querySelector<HTMLDetailsElement>('.inventory')!.addEventListener('toggle', e => { inventoryOpen = (e.target as HTMLDetailsElement).open; });
  if (focus) app.querySelector<HTMLElement>('#dispatch-title')?.focus();
  else if (focusSelector) {
    const previous = app.querySelector<HTMLElement>(focusSelector);
    const target = previous && !previous.matches(':disabled') ? previous : app.querySelector<HTMLElement>('.pending-panel, .hand-title h2');
    target?.focus({ preventScroll: true });
  }
}

function update(next: GameState, focus = false) {
  if (next === state) return;
  state = next;
  selected = [];
  inspection = {};
  reverseKept = false;
  render(focus);
}

function reset(seed: string, months = state.totalMonths) {
  state = createGame(seed.trim().slice(0, 80) || 'CALLISTO-01', months);
  selected = [];
  inspection = {};
  reverseKept = false;
  logOpen = false;
  inventoryOpen = false;
  const url = new URL(location.href);
  url.searchParams.set('seed', state.seed);
  url.searchParams.set('months', String(state.totalMonths));
  history.replaceState(null, '', url);
  render(true);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

app.addEventListener('click', e => {
  const button = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  if (button.dataset.card) {
    const uid = Number(button.dataset.card);
    if (state.pending?.kind === 'retire' || state.pending?.kind === 'discard') {
      selected = selected.includes(uid) ? selected.filter(n => n !== uid) : [...selected, uid];
      render();
    } else update(playCard(state, uid));
    return;
  }
  if (button.dataset.supply) {
    const id = button.dataset.supply as CardId;
    update(state.pending?.kind === 'gain' ? resolveChoice(state, { type: 'gain', cardId: id }) : buyCard(state, id));
    return;
  }
  const dialog = app.querySelector<HTMLDialogElement>('#restart-dialog')!;
  switch (button.dataset.action) {
    case 'begin': {
      if (state.phase === 'briefing') reset(app.querySelector<HTMLInputElement>('#launch-seed')!.value, Number(app.querySelector<HTMLSelectElement>('#launch-months')!.value));
      update(beginMonth(state), true);
      break;
    }
    case 'work': update(advancePhase(playAllWork(advancePhase(state)))); break;
    case 'all-work': update(advancePhase(playAllWork(state))); break;
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
    case 'reverse': reverseKept = !reverseKept; render(); break;
    case 'restart': dialog.showModal(); break;
    case 'new': dialog.showModal(); app.querySelector<HTMLInputElement>('#restart-seed')!.value = randomSeed(); break;
    case 'replay': reset(state.seed); break;
    case 'cancel-restart': dialog.close(); break;
    case 'random-seed': app.querySelector<HTMLInputElement>('#restart-seed')!.value = randomSeed(); break;
  }
});

app.addEventListener('change', e => {
  const input = e.target as HTMLSelectElement;
  if (input.dataset.inspect) {
    inspection[Number(input.dataset.inspect)] = input.value as 'keep' | 'discard' | 'retire';
    render();
  }
});

app.addEventListener('submit', e => {
  if ((e.target as HTMLElement).id !== 'restart-form') return;
  e.preventDefault();
  reset(app.querySelector<HTMLInputElement>('#restart-seed')!.value, Number(app.querySelector<HTMLSelectElement>('#restart-months')!.value));
});

render();

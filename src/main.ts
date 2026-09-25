import './style.css';
import { CARDS, CARGO_FAMILIES, CRISES } from './content.ts';
import {
  advancePhase, beginMonth, buyCard, canAcquire, canBuyCard, canPlayCard, cardById,
  createGame, endMonth, getCurrentCrisis, getCurrentEvent, getManifest, getScore, ownedCards,
  playAllWork, playCard, resolveChoice, resolveCrisis, respondToEvent,
} from './engine.ts';
import type { CardId, CardInstance, Crisis, CrisisResult, GameState } from './types.ts';
import { actionCost, endColonyWeek, startColony, takeColonyAction } from './colony.ts';
import type { ColonyAction, ColonyState } from './colony.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
let state = createGame(params.get('seed')?.trim().slice(0, 80) || 'CALLISTO-01', params.get('months') === '24' ? 24 : 12);
let colony: ColonyState | null = null;
let selected: number[] = [];
let inspection: Record<number, 'keep' | 'discard' | 'retire'> = {};
let reverseKept = false;
let logOpen = false;
let inventoryOpen = false;
const h = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pad = (n: number) => String(n).padStart(2, '0');
const active = () => ['event', 'ops', 'work', 'crisis', 'buy'].includes(state.phase);
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
      <li><span>01</span><div><strong>Draw five. Start with 1 Ops play and 1 Buy.</strong><p>Play Ops for effects, then Work to prepare new cards. Acquired cards go to your discard pile and return after a shuffle.</p></div></li>
      <li><span>02</span><div><strong>Cruise → Event → Crisis. Repeat.</strong><p>Every third month brings a decision. After playing your hand, spend Work, consume matching Cargo, or take Burdens. Then buy cards with what remains.</p></div></li>
      <li><span>03</span><div><strong>Bring something worth keeping.</strong><p>Habitat, Industry, and Science Cargo solve different crises, but using a kit forfeits its arrival points. Unresolved Burdens clog your draws and cost 1 point each at arrival.</p></div></li>
    </ol>
    <div class="launch-controls"><label class="seed-label" for="launch-seed">VOYAGE SEED<input id="launch-seed" maxlength="80" value="${h(state.seed)}" autocomplete="off" spellcheck="false"></label>
    <label class="seed-label" for="launch-months">LENGTH<select id="launch-months"><option value="12" ${state.totalMonths === 12 ? 'selected' : ''}>12 months · quick test</option><option value="24" ${state.totalMonths === 24 ? 'selected' : ''}>24 months · longer build</option></select></label>
    <button class="primary" data-action="begin">Begin the cruise ${arrow}</button></div>
    <p class="microcopy">Starting deck: 7 Crew Shift, 3 Colony Stores. No timer. Reloading resets the voyage.</p>`;
}

function crisisTerms(crisis: Crisis) {
  const family = CARGO_FAMILIES.find(f => f.id === crisis.cargoFamily)!.name;
  return `${crisis.workCost} Work, 1 ${family} Cargo, or ${crisis.burdenCount} ${cardById(crisis.burden).name} cards.`;
}

function responseSummary(result: CrisisResult) {
  return result.response === 'work' ? `Spent ${result.workSpent} Work`
    : result.response === 'cargo' ? `Used ${cardById(result.cargoSpent!).name}`
    : `Deferred · +${result.burdensAdded} ${cardById(CRISES.find(c => c.id === result.id)!.burden).name}`;
}

function crisisDecision() {
  const crisis = getCurrentCrisis(state);
  if (!crisis) return '';
  const result = state.crisisResults.find(r => r.month === state.month);
  if (result) return `<p class="event-rule">${h(responseSummary(result))}. Use the remaining Work for acquisitions.</p>`;
  const family = CARGO_FAMILIES.find(f => f.id === crisis.cargoFamily)!.name;
  if (state.phase !== 'crisis') return `<p class="event-rule">After playing Ops and Work, choose: ${h(crisisTerms(crisis))}</p><p class="microcopy">Work spent here cannot buy cards. Consumed Cargo loses its arrival points. Each unresolved Burden costs 1 point at arrival.</p>`;
  const cargo = CARDS.filter(c => c.cargoFamily === crisis.cargoFamily && ownedCards(state).some(held => held.id === c.id));
  const choosing = state.phase === 'crisis' && !state.pending;
  return `<section class="crisis-decision" aria-label="Crisis responses"><p class="microcopy">${choosing ? 'Choose a response before acquiring cards. These costs are paid once, now.' : 'Play Ops and Work first, then choose a response before acquisitions. All crises start with a normal five-card hand.'}</p>
    <div class="crisis-options">
      <div><h3>Use crew time</h3><p>${h(crisis.workText)}</p><p class="microcopy">${state.work >= crisis.workCost ? `Leaves ${state.work - crisis.workCost} Work for acquisitions.` : `Needs ${crisis.workCost} Work; you currently have ${state.work}.`} Uses no Buy.</p><button class="secondary" data-action="crisis-work" ${!choosing || state.work < crisis.workCost ? 'disabled' : ''}>Spend ${crisis.workCost} Work</button></div>
      <div><h3>Use ${family} Cargo</h3><p>${h(crisis.cargoText)}</p><label class="cargo-selector" for="crisis-cargo">Kit to consume<select id="crisis-cargo" ${!choosing || !cargo.length ? 'disabled' : ''}>${cargo.length ? cargo.map(c => `<option value="${c.id}">${h(c.name)} · lose ${c.points} ${c.points === 1 ? 'point' : 'points'}</option>`).join('') : '<option>No matching Cargo aboard</option>'}</select></label><button class="secondary" data-action="crisis-cargo" ${!choosing || !cargo.length ? 'disabled' : ''}>Consume 1 ${family} Cargo</button></div>
      <div><h3>Carry the consequences</h3><p>${h(crisis.deferText)}</p><p class="microcopy">Keep all Work and Cargo. Add ${crisis.burdenCount} Burdens to discard; they cost ${crisis.burdenCount} arrival points if still aboard.</p><button class="secondary" data-action="crisis-defer" ${!choosing ? 'disabled' : ''}>Take ${crisis.burdenCount} ${h(cardById(crisis.burden).name)}</button></div>
    </div><p class="microcopy">Consuming Cargo permanently retires it and its points. You may use any owned matching kit: hand first, then discard, then draw pile. No Work, Ops play, or Buy is spent.</p></section>${burdenPreview(crisis.burden)}`;
}

function burdenPreview(id: CardId) {
  const card = cardById(id);
  return `<aside class="burden-preview" id="burden-preview" aria-label="${h(card.name)} explained"><div><strong>${h(card.name)}</strong><span class="eyebrow">BURDEN</span></div><p>${h(card.text)}</p><p>Goes into your discard pile and returns in later shuffles. Retire it with a card such as Streamlining to remove it permanently.</p></aside>`;
}

function turnPanel() {
  const event = getCurrentEvent(state);
  const crisis = getCurrentCrisis(state);
  return `<div class="dispatch-header"><span class="eyebrow">MONTH ${pad(state.month)} / ${state.encounter.kind.toUpperCase()}</span><span class="status-tag">${state.totalMonths - state.month} MONTHS AFTER THIS</span></div>
    <h2 id="dispatch-title" tabindex="-1">${h(crisis?.name || event?.name || 'Room to work.')}</h2>
    <p class="dispatch-body">${h(crisis?.description || event?.description || 'No new fault has the crew’s attention. Use this month to strengthen the routines you will need later.')}</p>
    ${event ? `<p class="event-rule">${h(event.rule)}</p>` : ''}
    ${event?.effect.kind === 'gain-burden' ? burdenPreview(event.effect.burden) : ''}
    ${crisisDecision()}
    ${state.phase === 'event' && event?.effect.kind === 'discard-or-burden' ? eventDecision(event.effect) : ''}
    ${phaseControls()}`;
}

function eventDecision(effect: { count: number; cardType?: string; burden: CardId }) {
  const eligible = state.hand.filter(c => !effect.cardType || cardById(c.id).type === effect.cardType).length;
  return `${burdenPreview(effect.burden)}<p class="microcopy">Discarding removes ${effect.count} ${effect.cardType ? `${effect.cardType} ` : ''}${effect.count === 1 ? 'card' : 'cards'} from this hand with no replacement draw. Those cards keep their points and can return after a shuffle. Gaining the Burden keeps your full hand this month.</p><div class="event-actions"><button class="secondary" data-action="event-discard" ${state.pending || eligible < effect.count ? 'disabled' : ''}>Discard ${effect.count} ${effect.cardType || 'cards'}</button><button class="secondary" data-action="event-burden" aria-describedby="burden-preview" ${state.pending ? 'disabled' : ''}>Gain ${h(cardById(effect.burden).name)}</button></div>${eligible < effect.count ? '<p class="microcopy">You do not have enough eligible cards to pay the discard cost.</p>' : ''}`;
}

function phaseControls() {
  const phase = state.phase;
  return `<nav class="phase-strip" aria-label="Monthly sequence">${[['ops', '1 · Ops'], ['work', '2 · Work'], ...(getCurrentCrisis(state) ? [['crisis', '3 · Respond'], ['buy', '4 · Acquire']] : [['buy', '3 · Acquire']])].map(([key, label]) => `<span ${key === phase ? 'aria-current="step"' : ''}>${label}</span>`).join('<i aria-hidden="true">→</i>')}</nav>
    <div class="turn-actions">
    ${phase === 'ops' ? `<p>${state.ops ? state.hand.some(c => cardById(c.id).type === 'Ops') ? `${state.ops} Ops plays remaining. Each Ops card spends one play, then applies its effects.` : 'No Ops cards in hand. Play Work to acquire new cards.' : 'No Ops plays remaining. Move on to Work.'} Playing Work ends the Ops phase.</p><button class="primary" data-action="work" ${state.pending ? 'disabled' : ''}>${state.ops && state.hand.some(c => cardById(c.id).type === 'Ops') ? 'Finish Ops & play Work' : 'Play Work'} ${arrow}</button>` : ''}
    ${phase === 'work' ? `<p>Play your Work cards, then ${getCurrentCrisis(state) ? 'respond to the crisis' : 'acquire cards'}.</p><button class="primary" data-action="all-work" ${state.pending ? 'disabled' : ''}>Play all Work & ${getCurrentCrisis(state) ? 'respond' : 'acquire'} ${arrow}</button>` : ''}
    ${phase === 'buy' ? `<p>${state.buys ? `Choose a card below. ${state.buys} ${state.buys === 1 ? 'Buy' : 'Buys'} remaining.` : 'No Buys remaining. This month is ready to close.'} Ending the month discards your hand and played cards; unused Work, Ops plays, and Buys expire.</p><button class="primary" data-action="end" ${state.pending ? 'disabled' : ''}>End month ${pad(state.month)} ${arrow}</button>` : ''}
    ${phase === 'crisis' ? '<p>Choose one of the responses above. Work spent on the problem is unavailable for acquisitions.</p>' : ''}
    ${phase === 'event' ? '<p>Resolve the event before playing your hand.</p>' : ''}</div>${mobileHorizon()}`;
}

function mobileHorizon() {
  const nextMonth = (Math.floor(state.month / 3) + 1) * 3;
  const crisis = CRISES[(nextMonth / 3 - 1) % CRISES.length];
  return nextMonth <= state.totalMonths ? `<p class="mobile-horizon">Next crisis · M${pad(nextMonth)}: ${h(crisis.name)}. ${h(crisisTerms(crisis))}</p>` : '';
}

function report() {
  const result = state.crisisResults.find(r => r.month === state.month);
  const entries = state.log.filter(e => e.month === state.month && ['purchase', 'retirement', 'crisis', 'event'].includes(e.kind));
  return `<p class="eyebrow">MONTH ${pad(state.month)} / LOG RECORDED</p><h2 id="dispatch-title" tabindex="-1">${result ? result.response !== 'defer' ? 'The work is done.' : 'A workaround will have to do.' : 'A month behind us.'}</h2>
    <p class="dispatch-body">${result ? h(responseSummary(result)) + '. The crossing continues.' : 'The hand is discarded. Work and unused Ops do not carry forward.'}</p>
    <div class="report-entries">${entries.length ? entries.map(e => `<p><strong>${h(e.title)}</strong><br>${h(e.text)}</p>`).join('') : '<p>No cards acquired or retired this month.</p>'}</div>
    <div class="continue-row"><p>${nextEncounterText()}</p><button class="primary" data-action="begin">Continue to month ${pad(state.month + 1)} ${arrow}</button></div>`;
}

function nextEncounterText() {
  return `Next: ${['Crisis', 'Cruise', 'Event'][(state.month + 1) % 3]}. Draw a new hand and reset to 1 Ops play / 1 Buy.`;
}

function arrival() {
  const score = getScore(state);
  const manifest = getManifest(state);
  const workSpent = state.crisisResults.reduce((sum, r) => sum + r.workSpent, 0);
  const cargoUsed = manifest.reduce((sum, f) => sum + f.used, 0);
  const obligations = CARDS.filter(c => c.type === 'Burden').map(c => ({ ...c, count: ownedCards(state).filter(held => held.id === c.id).length })).filter(c => c.count);
  return `<p class="eyebrow">MONTH ${state.totalMonths} / ARRIVAL MANIFEST</p><h2 id="dispatch-title" tabindex="-1">You brought them this far.</h2>
    <p class="dispatch-body">Callisto fills the forward cameras. The equipment you preserved and the obligations you carried now belong to the founding expedition.</p>
    <div class="arrival-score"><strong>${score.total}</strong><div><span class="eyebrow">ARRIVAL POINTS</span><p>${score.cargo} Cargo points − ${score.burdens} unresolved Burdens. Crisis responses award no bonus points.</p></div></div>
    <div class="cargo-manifest" aria-label="Cargo preserved for arrival">${manifest.map(f => `<article><p class="eyebrow">${h(f.name)}</p><h3>${f.count} ${f.count === 1 ? 'kit' : 'kits'} preserved</h3><p>${h(f.purpose)}</p><p class="microcopy">${f.points} points · ${f.used} consumed in crises · ${f.retired} retired in total</p></article>`).join('')}</div>
    <div class="arrival-assessment"><div><h3>The cost of the crossing</h3><p>${workSpent} Work spent on problems. ${cargoUsed} Cargo ${cargoUsed === 1 ? 'kit' : 'kits'} consumed in response. ${state.retired.length} ${state.retired.length === 1 ? 'card' : 'cards'} retired overall.</p></div><div><h3>Unresolved obligations</h3><p>${obligations.length ? obligations.map(c => `${c.count} × ${h(c.name)}`).join('<br>') : 'No Burdens remain aboard.'}</p></div></div>
    <div class="crisis-history">${state.crisisResults.map(r => `<p><span>M${pad(r.month)}</span><strong>${h(CRISES.find(c => c.id === r.id)!.name)}</strong><span>${h(responseSummary(r))}</span></p>`).join('')}</div>
    <div class="end-actions"><button class="primary" data-action="colony-start">Begin Callisto trial ${arrow}</button><button class="secondary" data-action="new">Chart another voyage</button><button class="text-button" data-action="replay">Replay this seed ↺</button></div>
    <p class="microcopy">The optional six-week colony trial uses this manifest. Phase 1 preparation is not implemented.</p>`;
}

function colonyActionButton(label: string, action: ColonyAction, detail: string) {
  const cost = actionCost(colony!, action);
  const enabled = cost && cost.teams <= colony!.teams && cost.power <= colony!.power;
  return `<button class="colony-action" data-colony-action="${h(action)}" ${enabled ? '' : 'disabled'}><strong>${h(label)}</strong><span>${h(detail)}</span><small>${cost ? `${cost.teams} crew · ${cost.power} power` : 'Unavailable'}</small></button>`;
}

function renderColony() {
  const c = colony!;
  const finished = c.status !== 'active';
  app.innerHTML = `<header class="site-header"><span class="wordmark"><span class="brand-orbit" aria-hidden="true">◉</span> JOVIAN<span>WAKE</span><small>0.4</small></span><div class="header-right"><span class="prototype-label">CALLISTO / COMMISSIONING TRIAL</span><button class="text-button" data-action="colony-back">Arrival manifest ↗</button></div></header>
    <main class="colony-screen"><div class="mission-nav"><span>THE FIRST SIX WEEKS</span><span class="seed-display">SEED / ${h(state.seed)}</span></div>
      <section class="colony-hero panel"><p class="eyebrow">${finished ? 'COMMISSIONING ASSESSMENT' : `WEEK ${c.week} / 6`}</p><h1 id="dispatch-title" tabindex="-1">${finished ? c.status === 'viable' ? 'The foothold holds.' : 'The foothold falters.' : 'Everything needs the same hands.'}</h1><p>${finished ? c.status === 'viable' ? 'Essential systems are commissioned, but the work and obligations continue.' : 'The settlement cannot safely leave ship support on this schedule.' : 'Assign two crew teams and three power units each week. Unused capacity expires. Europa observations begin in week 3.'}</p></section>
      <div class="colony-stats"><article><span>SHIP RESERVES</span><strong>${c.reserves}</strong><small>Reach zero and the trial ends.</small></article><article><span>SHELTER</span><strong>${c.shelter}/2</strong><small>Habitat Cargo: ${c.cargo.habitat} kits</small></article><article><span>RECYCLER</span><strong>${c.recycler}/2</strong><small>Industry Cargo: ${c.cargo.industry} kits</small></article><article><span>EUROPA DATA</span><strong>${c.science}/4</strong><small>Science Cargo: ${c.cargo.science} kits</small></article></div>
      ${finished ? `<section class="colony-end panel"><h2>${c.status === 'viable' ? 'Settlement viable' : 'Settlement not yet viable'}</h2><p>${c.science === 4 ? 'The opening Europa observation campaign is complete.' : c.science ? `The campaign returned ${c.science} of 4 observations.` : 'No Europa observations were completed.'} ${c.issues.length} ${c.issues.length === 1 ? 'issue remains' : 'issues remain'}.</p><div class="end-actions"><button class="primary" data-action="colony-back">Review arrival manifest ${arrow}</button><button class="secondary" data-action="colony-retry">Retry colony from this manifest</button></div></section>` : `<section class="colony-work panel"><div class="colony-work-head"><div><p class="eyebrow">AVAILABLE THIS WEEK</p><h2>${c.teams} crew ${c.teams === 1 ? 'team' : 'teams'} · ${c.power} power</h2></div><p>Each unfinished essential system costs 1 reserve at week’s end. Each issue left from an earlier week costs 1 more, every week until resolved.</p></div><div class="colony-actions">${colonyActionButton('Commission shelter', 'shelter', 'Add 1 of 2 progress. Habitat kit saves one crew team.')}${colonyActionButton('Commission recycler', 'recycler', 'Add 1 of 2 progress. Industry kit saves one crew team.')}${colonyActionButton('Observe Europa', 'science', 'Add 1 data. Once per week, weeks 3–6; requires Science kit.')}</div><h3>Problems needing attention</h3><div class="colony-issues">${c.issues.length ? c.issues.map(i => colonyActionButton(i.name, `fix:${i.id}`, i.week === c.week ? 'New this week · no reserve cost yet' : 'Overdue · costs 1 reserve this week')).join('') : '<p>No open issues.</p>'}</div><button class="primary" data-action="colony-end">End week ${c.week} ${arrow}</button></section>`}
      <details class="voyage-log" open><summary>COMMISSIONING LOG</summary><div class="log-entries">${[...c.history].reverse().map(line => `<p>${h(line)}</p>`).join('')}</div></details><details class="how-to"><summary>Trial rules</summary><p>Two crew assignments and three power each week. Shelter and Recycler each need two commissioning actions. Without the matching Cargo family, one action takes both crew teams. Europa requires Science Cargo and can be observed once each week from week 3 onward. New issues have one week of grace; older open issues drain reserves. At week 6, viability needs both systems complete, at least one reserve, and no more than two open issues.</p><p>Starting reserves are five, plus one per five preserved Cargo kits, capped at two extra; three unresolved cruise Burdens remove one reserve, up to two. Any Burden also starts one Crew strain issue. This is a short systems test, not a full colony simulation.</p></details>
    </main>`;
}

function pendingPanel() {
  const p = state.pending;
  if (!p) return '';
  const title = p.source === 'event' ? 'Event response' : cardById(p.source).name;
  let body = '';
  if (p.kind === 'gain') {
    body = `<p>Choose ${p.requiredType === 'Ops' ? 'an Ops card' : 'a card'} costing up to ${p.maxCost} Work from the supply below. It goes to your discard pile, not your hand. This gain uses no Work or Buy.</p>`;
  } else if (p.kind === 'inspect') {
    const kept = p.cards.filter(c => (inspection[c.uid] || 'keep') === 'keep');
    if (reverseKept) kept.reverse();
    body = `<p>Keep returns a card to the top of your deck. Discard sets it aside until a shuffle. Retire removes it permanently and forfeits any Cargo points.</p><div class="inspect-cards">${p.cards.map(c => `<label><strong>${h(cardById(c.id).name)}</strong><small>${h(cardById(c.id).type)} · ${h(cardById(c.id).text)}</small><select data-inspect="${c.uid}" aria-label="Disposition for ${h(cardById(c.id).name)}"><option value="keep" ${(inspection[c.uid] || 'keep') === 'keep' ? 'selected' : ''}>Keep on top</option><option value="discard" ${inspection[c.uid] === 'discard' ? 'selected' : ''}>Discard</option><option value="retire" ${inspection[c.uid] === 'retire' ? 'selected' : ''}>Retire permanently</option></select></label>`).join('')}</div><p class="microcopy">Next draw: ${kept.map(c => h(cardById(c.id).name)).join(' → ') || 'No inspected cards kept'}</p><div class="selection-actions">${kept.length > 1 ? '<button class="secondary" data-action="reverse">Reverse kept order</button>' : ''}<button class="primary" data-action="confirm-inspect">Confirm inspection</button></div>`;
  } else {
    const verb = p.kind === 'retire' ? 'Retire' : 'Discard';
    const quantity = p.min === p.max ? `exactly ${p.min}` : `up to ${p.max}`;
    const eligible = `${p.kind === 'discard' && p.requiredType ? `${p.requiredType} ` : ''}${p.max === 1 ? 'card' : 'cards'}`;
    body = `<p>${verb} ${quantity} ${eligible} from your hand. ${p.kind === 'retire' ? 'Retired cards leave the deck permanently; Cargo loses its printed points.' : p.redraw ? 'Draw the same number afterward. Discarded cards can return after a shuffle.' : 'No replacement cards are drawn. Discarded cards can return after a shuffle.'}</p><div class="selection-actions"><span>${selected.length} selected</span><button class="primary" data-action="confirm-selection" ${selected.length < p.min || selected.length > p.max ? 'disabled' : ''}>${selected.length < p.min ? `Select ${p.min - selected.length} more` : selected.length ? `${verb} ${selected.length} ${selected.length === 1 ? 'card' : 'cards'}` : p.kind === 'retire' ? 'Retire no cards' : 'Discard no cards'}</button></div>`;
  }
  return `<section class="pending-panel" tabindex="-1" aria-label="Resolve ${h(title)}"><p class="eyebrow">RESOLVE / ${h(title)}</p>${body}</section>`;
}

function handCard(card: CardInstance) {
  const def = cardById(card.id);
  const p = state.pending;
  const picking = p?.kind === 'retire' || p?.kind === 'discard';
  const eligible = picking && (p.kind !== 'discard' || !p.requiredType || def.type === p.requiredType);
  const enabled = picking ? eligible && (selected.includes(card.uid) || selected.length < p.max) : canPlayCard(state, card.uid);
  const label = picking ? selected.includes(card.uid) ? 'Selected' : eligible ? 'Select' : 'Ineligible' : enabled ? 'Play' : def.type === 'Cargo' ? `+${def.points} arrival ${def.points === 1 ? 'point' : 'points'}` : def.type === 'Burden' ? '−1 arrival point' : 'In hand';
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
  const restricted = c.type === 'Ops' && state.allowedOps && !state.allowedOps.includes(id);
  const reason = restricted ? 'Unavailable this month' : enabled ? gaining ? 'Gain card' : 'Acquire card' : gaining ? 'Outside gain limit' : state.phase !== 'buy' ? 'Acquire after playing your hand' : !state.buys ? 'No Buys remaining' : `Needs ${c.cost} Work`;
  return `<button class="supply-card type-${c.type.toLowerCase()} ${restricted ? 'restricted' : ''}" data-supply="${id}" ${enabled ? '' : 'disabled'} aria-label="${gaining ? 'Gain' : 'Acquire'} ${h(c.name)}, cost ${c.cost} Work"><span class="card-top"><span>${c.type}</span><b>${c.cost} W</b></span><strong class="card-name">${h(c.name)}</strong><span class="card-rule">${h(c.text)}</span><span class="card-flavor">${h(c.flavor)}</span><span class="card-bottom">${reason}</span></button>`;
}

function supplyPanel() {
  if (state.phase === 'arrived') return '';
  return `<section class="supply-section" aria-labelledby="supply-title"><div class="section-heading"><div><p class="eyebrow">ONBOARD PREPARATIONS</p><h2 id="supply-title">Prepare what comes next.</h2></div><p>Buying costs the printed Work amount plus 1 Buy. Card effects that say “gain” add a card for free. Both put the new card in your discard pile for a later draw. Acquisitions have no supply caps. W = Work.</p></div>
    ${state.allowedOps ? '<p class="restriction-note">Earth Political Shock: only the three highlighted Ops piles can be bought or gained this month. Owned Ops still work.</p>' : ''}
    <h3 class="catalog-label">Work · effort for repairs and acquisitions</h3>
    <div class="supply-basics">${CARDS.filter(c => c.type === 'Work').map(c => supplyCard(c.id)).join('')}</div>
    <h3 class="catalog-label">Cargo · preserve for arrival or consume during a crisis</h3>
    <div class="supply-cargo">${CARDS.filter(c => c.type === 'Cargo').map(c => supplyCard(c.id)).join('')}</div>
    <h3 class="catalog-label">Ops · build your crew’s routines</h3>
    <div class="supply-ops">${CARDS.filter(c => c.type === 'Ops').map(c => supplyCard(c.id)).join('')}</div></section>`;
}

function deckPanel() {
  const cards = ownedCards(state);
  const score = getScore(state);
  const nextMonth = (Math.floor(state.month / 3) + 1) * 3;
  const nextCrisis = CRISES[(Math.ceil(nextMonth / 3) - 1) % CRISES.length];
  return `<aside class="deck-panel panel" aria-label="Deck and voyage overview"><p class="eyebrow">WHAT WE CARRY</p><h2>${cards.length} cards. <span>${score.total} points.</span></h2>
    <div class="deck-counts">${(['Work', 'Ops', 'Cargo', 'Burden'] as const).map(type => `<div class="type-${type.toLowerCase()}"><strong>${cards.filter(c => cardById(c.id).type === type).length}</strong><span>${type}</span></div>`).join('')}</div>
    <p class="microcopy">${score.cargo} Cargo points − ${score.burdens} unresolved Burdens.<br>Retired: ${state.retired.length}. Cargo scores its printed value.</p>
    ${state.phase !== 'arrived' && nextMonth <= state.totalMonths ? `<div class="next-crisis"><p class="eyebrow">ON THE HORIZON / MONTH ${pad(nextMonth)}</p><h3>${h(nextCrisis.name)}</h3><p>${h(crisisTerms(nextCrisis))}</p><p class="microcopy">Choose after playing Work, before acquiring cards. Consumed Cargo forfeits its points.</p></div>` : ''}
    <details class="inventory" ${inventoryOpen || state.phase === 'arrived' ? 'open' : ''}><summary>Inspect the whole deck</summary><div>${CARDS.filter(c => cards.some(instance => instance.id === c.id)).map(c => `<details class="inventory-card"><summary><span>${h(c.name)}</span><b>×${cards.filter(instance => instance.id === c.id).length}</b></summary><p>${h(c.type)} · ${h(c.text)}</p></details>`).join('')}</div></details>
    <p class="deck-footnote">Callisto is the foothold.<br>Europa is the reason.</p></aside>`;
}

function counters() {
  if (!active()) return '';
  return `<section class="turn-counters" aria-label="Turn resources">${[['Ops plays left', state.ops], ['Work to spend', state.work], ['Buys remaining', state.buys], ['Arrival points', getScore(state).total]].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</section>`;
}

function purchaseDock() {
  if (state.phase !== 'buy') return '';
  const lastGain = state.log.filter(e => e.month === state.month && e.kind === 'purchase').at(-1);
  return `<div class="purchase-dock" aria-label="Acquisition controls"><div><strong>M${pad(state.month)} · ${state.work} Work · ${state.buys} ${state.buys === 1 ? 'Buy' : 'Buys'}</strong><p>${lastGain ? h(lastGain.title) : 'Acquired cards go to discard.'}</p></div><button class="primary" data-action="end">Close month ${arrow}</button></div>`;
}

function render(focus = false) {
  if (colony) { renderColony(); if (focus) app.querySelector<HTMLElement>('#dispatch-title')?.focus(); return; }
  const focused = document.activeElement as HTMLElement | null;
  const focusSelector = focused?.dataset.card ? `[data-card="${focused.dataset.card}"]` : focused?.dataset.supply ? `[data-supply="${focused.dataset.supply}"]` : focused?.dataset.inspect ? `[data-inspect="${focused.dataset.inspect}"]` : '';
  app.innerHTML = `<header class="site-header"><span class="wordmark"><span class="brand-orbit" aria-hidden="true">◉</span> JOVIAN<span>WAKE</span><small>0.4</small></span><div class="header-right"><span class="prototype-label">CRUISE / COLONY TRIAL</span><button class="text-button" data-action="restart">New voyage ↗</button></div></header>
    <main data-phase="${state.phase}" data-month="${state.month}"><div class="mission-nav"><span>EXPEDITION CONTROL</span><span class="seed-display">SEED / ${h(state.seed)}</span></div>${hero()}${counters()}
    <div class="game-layout deck-layout"><div class="main-column"><section class="dispatch panel" aria-labelledby="dispatch-title">${state.phase === 'briefing' ? briefing() : state.phase === 'report' ? report() : state.phase === 'arrived' ? arrival() : turnPanel()}</section>${handPanel()}</div>${deckPanel()}</div>
    <div class="sr-only" aria-live="polite">Month ${state.month}, ${state.phase} phase. ${state.ops} Ops, ${state.work} Work, ${state.buys} Buys.${state.pending ? ' A card choice is pending.' : ''} ${h(state.log.at(-1)?.title || '')}</div>
    ${supplyPanel()}
    <details class="voyage-log" ${logOpen ? 'open' : ''}><summary>VOYAGE LOG <span class="log-count">${state.log.length} ENTRIES</span></summary><div class="log-entries">${[...state.log].reverse().map(e => `<article><span class="log-month">M${pad(e.month)}</span><div><h3>${h(e.title)}</h3><p>${h(e.text)}</p></div></article>`).join('') || '<p>The voyage has yet to begin.</p>'}</div></details>
    <details class="how-to"><summary>Rules & card types</summary><p><strong>Work</strong> generates this month’s purchasing power. <strong>Ops</strong> spends one Ops play and resolves its card text; extra Ops lets you chain cards. <strong>Cargo</strong> scores at arrival and can be permanently consumed for matching crisis responses. It has no normal play effect. <strong>Burden</strong> clogs your draws and costs 1 point at arrival if unresolved.</p><p>Play Ops first, then Work, respond to any crisis, then acquire cards. You cannot return to an earlier phase. Gained cards go to discard. When the draw pile runs out, shuffle the discard pile. Cleanup discards the entire hand and all cards in play; leftover Work, Ops, and Buys expire.</p><p>Retirement permanently removes a card and forfeits its points. Every owned Cargo card scores its printed value; each owned Burden subtracts 1 point. Score includes all owned piles. Every third month brings a choice: spend Work, permanently consume matching Cargo, or accept Burdens. Paying Work reduces what you can buy. Cargo can be taken from any owned pile, using a copy in hand first, then discard, then draw. The 24-month mode repeats the four-crisis sequence. Some events automatically add a Burden after the opening draw. Acquisitions have no supply caps; they represent preparations using equipment already aboard.</p><p>The same seed, length, and choices reproduce a voyage. No saves across reloads. These are deliberately compressed gameplay timescales, not a trajectory simulation. The optional six-week colony trial begins from the arrival manifest; Phase 1 preparation is not implemented.</p></details>
    <footer><span>JOVIAN WAKE <b>/</b> PROTOTYPE 0.4</span><span>THE DISTANCE IS THE TEST.</span></footer></main>${purchaseDock()}
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
  colony = null;
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
  if (colony) {
    if (button.dataset.colonyAction) { colony = takeColonyAction(colony, button.dataset.colonyAction as ColonyAction); render(); return; }
    if (button.dataset.action === 'colony-end') { colony = endColonyWeek(colony); render(true); return; }
    if (button.dataset.action === 'colony-retry') { colony = startColony(state); render(true); return; }
    if (button.dataset.action === 'colony-back') { colony = null; render(true); return; }
    return;
  }
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
    case 'colony-start': colony = startColony(state); render(true); break;
    case 'begin': {
      if (state.phase === 'briefing') reset(app.querySelector<HTMLInputElement>('#launch-seed')!.value, Number(app.querySelector<HTMLSelectElement>('#launch-months')!.value));
      update(beginMonth(state), true);
      break;
    }
    case 'work': update(advancePhase(playAllWork(advancePhase(state))), !!getCurrentCrisis(state)); break;
    case 'all-work': update(advancePhase(playAllWork(state)), !!getCurrentCrisis(state)); break;
    case 'crisis-work': update(resolveCrisis(state, 'work'), true); break;
    case 'crisis-defer': update(resolveCrisis(state, 'defer'), true); break;
    case 'crisis-cargo': update(resolveCrisis(state, 'cargo', app.querySelector<HTMLSelectElement>('#crisis-cargo')!.value as CardId), true); break;
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

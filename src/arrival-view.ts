import { ARRIVAL_STAGES, CARDS, CRISES } from './content.ts';
import { cardById, getArrivalDemand, getArrivalOutcome, getArrivalRequirements, getManifest, getScore, ownedCards } from './engine.ts';
import type { ArrivalObjective, CardType, GameState } from './types.ts';

const h = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const objectives: ArrivalObjective[] = ['trajectory', 'ship', 'surface'];
const label = (name: string) => name[0].toUpperCase() + name.slice(1);

export function arrivalEncounter(state: GameState): string {
  if (state.phase === 'arrival-ready') return `<p class="eyebrow">CRUISE COMPLETE / FOUR TURNS REMAIN</p><h2 id="dispatch-title" tabindex="-1">Jovian Arrival</h2>
    <p class="dispatch-body">Acquisitions are closed. Use the deck you built to establish Trajectory, protect the Ship, and activate the Surface foothold.</p>
    <p>Play Ops, then Work. Pay each stage's demand on its own turn, and prepare Trajectory, Ship, and Surface with remaining Work or Cargo. Readiness persists; stage payments and unused Work do not carry forward.</p>
    <ol class="arrival-schedule">${ARRIVAL_STAGES.map(stage => `<li><strong>${h(stage.name)} · ${stage.work} Work</strong><span>Deployed ${label(stage.support)} Cargo reduces this by 1 per kit, maximum 2.</span></li>`).join('')}</ol>
    <p class="microcopy">Cargo drawn into hand can deploy once for readiness and continuing stage support, or be cannibalized for Work. Missing capture or radiation operations forces emergency readiness and ship damage. Missing transfer leaves survivors in orbit; missing activation leaves a ship-supported refuge. Full activation needs all four demands and readiness objectives.</p>
    <button class="primary" data-action="arrival-begin">Begin Jovian Arrival ↗</button>`;
  const arrival = state.arrival!;
  const stage = ARRIVAL_STAGES[arrival.turn - 1];
  const demand = getArrivalDemand(state);
  if (state.phase === 'arrival-report') {
    const entries = state.log.filter(entry => entry.arrivalTurn === arrival.turn);
    return `<p class="eyebrow">ARRIVAL TURN ${arrival.turn} / RECORDED</p><h2 id="dispatch-title" tabindex="-1">${h(stage.name)} recorded.</h2>
      <div class="report-entries">${entries.map(entry => `<p><strong>${h(entry.title)}</strong><br>${h(entry.text)}</p>`).join('')}</div>
      <button class="primary" data-action="arrival-begin">Continue to arrival turn ${arrival.turn + 1} ↗</button>`;
  }
  return `<p class="eyebrow">JOVIAN ARRIVAL / TURN ${arrival.turn} OF 4</p><h2 id="dispatch-title" tabindex="-1">${h(stage.name)}</h2><p>${h(stage.text)}</p>
    <p class="event-rule">This turn needs ${demand.required} Work committed to stage operations. ${h(stage.failure)}</p>`;
}

export function renderArrivalPanel(state: GameState): string {
  const requirements = getArrivalRequirements(state);
  const progress = state.arrival?.progress ?? { trajectory: 0, ship: 0, surface: 0 };
  const allocating = state.phase === 'arrival' && !state.pending;
  const availableWork = state.arrival && ['ops', 'work', 'arrival'].includes(state.phase) ? state.work : 0;
  const cargo = state.hand.filter(card => cardById(card.id).type === 'Cargo');
  const demand = getArrivalDemand(state);
  const allDemand = Math.min(availableWork, demand.remaining);
  return `<aside class="table-supply panel arrival-panel" aria-labelledby="arrival-title">
    <p class="eyebrow">ACQUISITIONS CLOSED / SAME VOYAGE DECK</p><h2 id="arrival-title">Arrival operations</h2>
    <p class="arrival-work" data-counter="work"><b>${availableWork}</b> Work available</p>
    <section class="arrival-demand" data-met="${demand.remaining === 0}" aria-labelledby="arrival-demand-title"><p class="eyebrow">FRESH DEMAND / TURN ${state.arrival?.turn || 1}</p><h3 id="arrival-demand-title">${h(demand.stage.name)}</h3>
      <strong>${demand.paid} / ${demand.required} Work committed</strong><progress aria-label="Stage demand paid" value="${Math.min(demand.paid, demand.required)}" max="${demand.required}"></progress>
      <p>${demand.stage.work} base − ${demand.support} deployed ${label(demand.stage.support)} support</p>
      <div class="arrival-buttons"><button class="secondary" aria-label="Commit 1 Work to stage demand" data-arrival-demand="1" ${!allocating || !allDemand ? 'disabled' : ''}>Commit 1 Work</button><button class="secondary" aria-label="Commit ${allDemand} Work to stage demand" data-arrival-demand="${allDemand}" ${!allocating || !allDemand ? 'disabled' : ''}>Commit all · ${allDemand} Work</button></div>
      <p class="microcopy">${demand.remaining === 0 ? 'Demand met for this turn.' : `${demand.remaining} Work still needed this turn.`} Payment is separate from readiness. Deploy matching Cargo first to reduce the cost.</p>
    </section>
    <h3>Readiness preparation</h3><p class="microcopy">Readiness carries forward. Later stages still need fresh Work.</p>
    <div class="arrival-objectives">${objectives.map(objective => {
      const remaining = Math.max(0, requirements.targets[objective] - progress[objective]);
      const all = Math.min(availableWork, remaining);
      return `<section><div><h3>${label(objective)}</h3><strong>${progress[objective]} / ${requirements.targets[objective]}</strong></div>
        <progress aria-label="${label(objective)} progress" value="${Math.min(progress[objective], requirements.targets[objective])}" max="${requirements.targets[objective]}"></progress>
        <div class="arrival-buttons"><button class="secondary" aria-label="Commit 1 Work to ${label(objective)}" data-arrival-objective="${objective}" data-amount="1" ${!allocating || !all ? 'disabled' : ''}>Commit 1 Work</button><button class="secondary" aria-label="Commit ${all} available Work to ${label(objective)}" data-arrival-objective="${objective}" data-amount="${all}" ${!allocating || !all ? 'disabled' : ''}>Commit all · ${all} Work</button></div></section>`;
    }).join('')}</div>
    <p class="microcopy">Ship survival needs ${requirements.minimumShip} progress. Full ship readiness needs ${requirements.targets.ship}. A viable foothold also needs the Trajectory and Surface targets.</p>
    <details class="arrival-penalties" open><summary>Arrival pressures</summary><ul>
      <li>Fatigue absorbs ${requirements.fatigue} Work each turn (${state.arrival?.fatigueTax ?? requirements.fatigue} still due this turn; maximum 2).</li>
      <li>Repair Backlog raises Ship needs, maximum +3.</li>
      <li>Exposure Monitoring raises Trajectory needs, maximum +3.</li>
      <li>Medical Follow-Up raises Surface needs, maximum +3.</li>
      <li>Crew Conflict: Cargo deployment costs ${requirements.deploymentCost} Work.</li>
      <li>Missed stage operations: ${state.arrival?.damage ?? 0} ship damage.</li>
    </ul><p class="microcopy">Retiring obligations reduces future pressures. This turn's Fatigue was assessed when the watch began.</p></details>
    <h3>Cargo in this hand</h3><p class="microcopy">Deployment preserves the kit, adds readiness once, and provides matching stage support, capped at 2. Cannibalization permanently loses it for +3 Work, subject to remaining Fatigue.</p>
    <div class="arrival-cargo">${cargo.map(card => `<article><strong>${h(cardById(card.id).name)}</strong><p>${h(cardById(card.id).text)}</p>
      <div class="arrival-buttons"><button class="secondary" data-arrival-cargo="${card.uid}" data-cargo-action="deploy" ${!allocating || state.work < requirements.deploymentCost ? 'disabled' : ''}>Deploy${requirements.deploymentCost ? ' · 1 Work' : ''}</button><button class="secondary" data-arrival-cargo="${card.uid}" data-cargo-action="sacrifice" ${!allocating ? 'disabled' : ''}>Cannibalize · +3 Work</button></div></article>`).join('') || '<p class="microcopy">No Cargo in hand. Draw or retrieve kits during Ops.</p>'}</div>
    ${state.phase === 'arrival' ? `<div class="arrival-end">${demand.remaining ? `<p class="arrival-demand-warning">${h(demand.stage.failure)} ${demand.remaining} Work remains unpaid.</p>` : ''}<button class="primary" data-action="arrival-end" ${state.pending ? 'disabled' : ''}>${state.arrival!.turn === 4 ? 'Finish expedition' : `End arrival turn ${state.arrival!.turn}`} ↗</button>${state.work ? `<p class="microcopy">${state.work} unused Work will expire.</p>` : ''}</div>` : '<p class="microcopy">Finish Ops and Work before committing Work or deploying Cargo.</p>'}
  </aside>`;
}

export function renderArrivalDebrief(state: GameState): string {
  const outcome = getArrivalOutcome(state)!;
  const arrival = state.arrival!;
  const requirements = getArrivalRequirements(state);
  const score = getScore(state);
  const manifest = getManifest(state);
  const cards = ownedCards(state);
  const deckTypes: CardType[] = ['Work', 'Ops', 'Cargo', 'Burden'];
  const burdens = cards.filter(card => cardById(card.id).type === 'Burden');
  const obligations = [...new Set(burdens.map(card => card.id))];
  return `<main class="mission-debrief arrival-debrief" data-phase="arrived" data-month="${state.month}" data-survived="${outcome.survived}">
    <div class="debrief-register"><span>EXPEDITION ARCHIVE / FOUR-TURN ARRIVAL</span><span class="debrief-seed">SEED / ${h(state.seed)}</span></div>
    <section class="debrief-hero"><div class="debrief-heading"><p class="debrief-kicker">${state.totalMonths}-MONTH CROSSING / JOVIAN ARRIVAL</p><h1 id="dispatch-title" tabindex="-1">Mission Debrief</h1><p class="debrief-outcome">${h(outcome.title)}</p><p class="debrief-intro">${h(outcome.crew)}</p></div>
      <div class="debrief-score"><p class="debrief-kicker">SECONDARY CARGO TALLY</p><strong>${score.total}</strong><p><b>${score.cargo}</b> Cargo points − <b>${score.burdens}</b> Burdens</p><p>This tally does not determine survival.</p></div></section>
    <section class="debrief-chapter"><div class="debrief-section-head"><div><p class="debrief-kicker">WHAT THE DECK ACHIEVED</p><h2>Arrival outcome</h2></div></div>
      <div class="arrival-results">${objectives.map(objective => {
        const readiness = objective === 'trajectory' ? outcome.trajectoryReady : objective === 'ship' ? outcome.shipReady : outcome.surfaceReady;
        const missed = objective === 'trajectory' ? !arrival.demands.some(result => result.turn === 3 && result.met)
          : objective === 'surface' ? !arrival.demands.some(result => result.turn === 4 && result.met) : arrival.demands.some(result => result.turn <= 2 && !result.met);
        const text = objective === 'ship' ? `${requirements.minimumShip} needed for crew survival; ${requirements.targets.ship} for full readiness.${missed ? ' A stage demand was missed; emergency readiness only.' : ''}`
          : readiness ? 'Objective achieved.' : missed ? `${objective === 'trajectory' ? 'Callisto transfer' : 'Surface activation'} demand missed.` : 'Readiness incomplete.';
        return `<article><h3>${label(objective)}</h3><strong>${arrival.progress[objective]} / ${requirements.targets[objective]}</strong><p>${text}</p></article>`;
      }).join('')}</div>
      <div class="debrief-next"><div><h3>${h(outcome.industry)}</h3><p>${h(outcome.science)}</p></div><div><h3>${arrival.sacrificed.length} Cargo cannibalized during arrival</h3><p>${arrival.sacrificed.map(id => h(cardById(id).name)).join(' · ') || 'No arrival cannibalization.'}</p></div></div>
    </section>
    <section class="debrief-chapter debrief-stage-record"><div class="debrief-section-head"><div><p class="debrief-kicker">FRESH DEMANDS / FOUR TURNS</p><h2>Arrival stage operations</h2></div></div>
      <ol>${ARRIVAL_STAGES.map((stage, index) => {
        const result = arrival.demands.find(result => result.turn === index + 1);
        return `<li data-met="${result?.met ?? false}"><p class="debrief-kicker">TURN ${index + 1} / ${result?.met ? 'MET' : 'MISSED'}</p><h3>${h(stage.name)}</h3><p>${result ? `${result.paid} / ${result.required} Work committed · ${result.support} Cargo support` : 'No stage payment recorded.'}</p>${!result?.met ? `<p class="debrief-note">${h(stage.failure)}</p>` : ''}</li>`;
      }).join('')}</ol>
    </section>
    <section class="debrief-deck" aria-labelledby="debrief-deck-title"><div class="debrief-section-head"><div><p class="debrief-kicker">THE CARDS THAT MADE THE CROSSING</p><h2 id="debrief-deck-title">Final expedition deck</h2></div><p class="debrief-deck-total"><b>${cards.length}</b> ${cards.length === 1 ? 'card' : 'cards'}</p></div>
      <p class="debrief-note">All remaining cards, including deployed Cargo. Open a card for its rules.</p>
      <div class="debrief-deck-groups">${deckTypes.map(type => {
        const definitions = CARDS.filter(card => card.type === type && cards.some(instance => instance.id === card.id));
        const count = cards.filter(card => cardById(card.id).type === type).length;
        return `<section class="debrief-deck-group type-${type.toLowerCase()}" aria-labelledby="debrief-deck-${type.toLowerCase()}"><h3 id="debrief-deck-${type.toLowerCase()}">${type}<small>${count} ${count === 1 ? 'card' : 'cards'}</small></h3>
          ${definitions.map(card => {
            const copies = cards.filter(instance => instance.id === card.id).length;
            const deployed = arrival.deployed.filter(instance => instance.id === card.id).length;
            return `<details class="inventory-card" data-card-id="${h(card.id)}"><summary><span>${h(card.name)}${deployed ? `<small>${deployed} deployed</small>` : ''}</span><b>×${copies}</b></summary><p>${h(card.text)}</p></details>`;
          }).join('') || '<p class="debrief-note">None remaining.</p>'}</section>`;
      }).join('')}</div>
    </section>
    <section class="debrief-survived"><h2>${outcome.survived ? 'Equipment preserved' : 'Final equipment record'}</h2><div class="arrival-results">${manifest.map(family => `<article><h3>${h(family.name)}</h3><strong>${family.count} kits</strong><p>${arrival.deployed.filter(card => cardById(card.id).cargoFamily === family.id).length} deployed; ${family.retired} permanently lost across the expedition.</p></article>`).join('')}</div></section>
    <section class="debrief-obligations"><h2>Unresolved obligations</h2>${obligations.length ? `<ul>${obligations.map(id => `<li><span>${h(cardById(id).name)}</span><b>×${burdens.filter(card => card.id === id).length}</b></li>`).join('')}</ul>` : '<p>No unresolved Burdens.</p>'}</section>
    <section class="debrief-choices"><h2>Cruise crisis decisions</h2><ol>${state.crisisResults.map(result => `<li class="debrief-decision ${result.response}"><p class="debrief-kicker">MONTH ${result.month}</p><h3>${h(CRISES.find(crisis => crisis.id === result.id)!.name)}</h3><p>${result.response === 'defer' ? `${result.burdensAdded} Burdens accepted` : `${result.workSpent} Work spent${result.cargoSpent ? `; ${h(cardById(result.cargoSpent).name)} consumed` : ''}`}</p></li>`).join('')}</ol></section>
    <details class="debrief-record"><summary>Arrival log</summary>${state.log.filter(entry => entry.arrivalTurn).map(entry => `<p><strong>Turn ${entry.arrivalTurn}: ${h(entry.title)}</strong><br>${h(entry.text)}</p>`).join('')}</details>
    <div class="debrief-actions"><button class="primary" data-action="new">Chart another voyage ↗</button><button class="secondary" data-action="replay">Replay this seed ↺</button></div>
    <footer class="debrief-footer"><span>JOVIAN WAKE / EXPEDITION REPORT</span><span>THE DECK MADE THE CROSSING.</span></footer></main>`;
}

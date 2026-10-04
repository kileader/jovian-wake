import { CARDS, CRISES } from './content.ts';
import { cardById, getManifest, getScore, ownedCards } from './engine.ts';
import type { ColonyState } from './colony.ts';
import type { CrisisResult, GameState } from './types.ts';

const h = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function crisisEntry(result: CrisisResult) {
  const crisis = CRISES.find(c => c.id === result.id)!;
  const cost = result.response === 'work' ? `${result.workSpent} Work committed`
    : result.response === 'cargo' ? `${cardById(result.cargoSpent!).name} consumed`
    : `${result.burdensAdded} ${cardById(crisis.burden).name} added`;
  const account = result.response === 'work' ? crisis.workText : result.response === 'cargo' ? crisis.cargoText : crisis.deferText;
  return `<li class="debrief-decision ${result.response}"><p class="debrief-kicker">MONTH ${String(result.month).padStart(2, '0')} <span>${result.response === 'defer' ? 'DEFERRED' : result.response === 'cargo' ? 'CARGO USED' : 'WORK PAID'}</span></p><h3>${h(crisis.name)}</h3><p class="decision-cost">${h(cost)}</p><p class="decision-account">${h(account)}</p></li>`;
}

function nextChapter(colony: ColonyState | null) {
  if (!colony) return `<div class="debrief-next pending">
    <div><p class="debrief-kicker">CALLISTO / NOT BEGUN</p><h3>A foothold still to build.</h3><p>The arrival manifest is ready. Settlement viability has not yet been tested.</p></div>
    <div><p class="debrief-kicker">EUROPA / AWAITING COMMISSIONING</p><h3>Science follows survival.</h3><p>The optional six-week trial opens observations in weeks 3–6, if Science Cargo survived the crossing.</p></div>
  </div>`;
  const active = colony.status === 'active';
  const settlement = active ? 'Trial in progress' : colony.status === 'viable' ? 'Settlement viable' : 'Settlement not viable';
  const account = active ? 'Commissioning is underway; viability is still undetermined.'
    : colony.status === 'viable' ? 'Shelter and recycling hold. The expedition can establish its foothold.'
    : !colony.reserves ? 'Ship-support reserves were exhausted before the foothold could hold.'
    : colony.shelter < 2 || colony.recycler < 2 ? 'Essential systems were still unfinished at the end of the trial.'
    : 'Too many open issues remained to leave ship support safely.';
  const campaign = colony.science === 4 ? 'Opening campaign complete' : colony.science ? 'Opening campaign partial' : 'No observations returned';
  return `<div class="debrief-next">
    <div class="settlement-${colony.status}"><p class="debrief-kicker">CALLISTO / ${active ? `WEEK ${colony.week} OF 6` : `TRIAL CLOSED · WEEK ${colony.week}`}</p><h3><span class="debrief-status-dot" aria-hidden="true"></span>${settlement}</h3><p>${account}</p>
      <div class="debrief-systems"><span>Shelter <b>${colony.shelter}/2</b></span><span>Recycler <b>${colony.recycler}/2</b></span><span>Reserves <b>${colony.reserves}</b></span></div>
      <p class="debrief-open-issues">${colony.issues.length ? `Open issues: ${colony.issues.map(i => h(i.name)).join(' · ')}` : 'No open settlement issues.'}</p>
    </div>
    <div class="debrief-science"><p class="debrief-kicker">EUROPA / SCIENCE RETURN</p><div class="science-return"><strong>${colony.science}<span>/4</span></strong><div><h3>${campaign}</h3><p>Observations collected${active ? ' so far' : ' during commissioning'}.</p></div></div>
      <div class="science-track" aria-hidden="true">${Array.from({ length: 4 }, (_, i) => `<i class="${i < colony.science ? 'collected' : ''}"></i>`).join('')}</div>
      <p>${colony.science === 4 ? 'All four observation windows returned Europa data.' : active ? 'The campaign remains open while the trial continues.' : colony.science ? `${plural(4 - colony.science, 'observation window')} closed without data.` : 'The opening Europa campaign returned no data.'}</p>
    </div>
  </div>`;
}

/** A read-only expedition report. Simulation and scoring remain in the engines. */
export function renderMissionDebrief(state: GameState, colony: ColonyState | null = null): string {
  const score = getScore(state);
  const manifest = getManifest(state);
  const cards = ownedCards(state);
  const burdens = CARDS.filter(c => c.type === 'Burden').map(c => ({ name: c.name, count: cards.filter(held => held.id === c.id).length })).filter(c => c.count);
  const preserved = manifest.reduce((sum, f) => sum + f.count, 0);
  const consumed = manifest.reduce((sum, f) => sum + f.used, 0);
  const otherRetired = manifest.reduce((sum, f) => sum + f.retired - f.used, 0);
  const workSpent = state.crisisResults.reduce((sum, r) => sum + r.workSpent, 0);
  const lostPoints = state.retired.reduce((sum, c) => sum + (cardById(c.id).type === 'Cargo' ? cardById(c.id).points ?? 0 : 0), 0);
  const nextAction = !colony ? 'colony-start' : colony.status === 'active' ? 'colony-resume' : 'colony-retry';
  const nextLabel = !colony ? 'Begin Callisto trial' : colony.status === 'active' ? 'Resume Callisto trial' : 'Retry Callisto trial';
  return `<main class="mission-debrief" data-phase="arrived" data-month="${state.month}">
    <div class="debrief-register"><span>EXPEDITION ARCHIVE <b>/</b> FLIGHT REPORT</span><span class="debrief-seed">SEED / ${h(state.seed)}</span></div>
    <section class="debrief-hero" aria-labelledby="dispatch-title">
      <div class="debrief-heading"><p class="debrief-kicker">EARTH → CALLISTO <span>/</span> ${state.totalMonths}-MONTH CROSSING</p><h1 id="dispatch-title" tabindex="-1">Mission Debrief</h1><p class="debrief-outcome"><span class="debrief-status-dot" aria-hidden="true"></span>Callisto reached.</p><p class="debrief-intro">What survived the crossing now belongs to the founding expedition.</p></div>
      <div class="debrief-destination" aria-hidden="true"><div class="debrief-orbits"><i></i><i></i><i></i><b></b></div><span>JOVIAN SYSTEM<br>DESTINATION / CALLISTO</span></div>
      <div class="debrief-score"><p class="debrief-kicker">ARRIVAL SCORE</p><strong>${score.total}</strong><p><b>${score.cargo}</b> Cargo points <span>−</span> <b>${score.burdens}</b> Burdens</p></div>
    </section>
    <div class="debrief-balance">
      <section class="debrief-survived" aria-labelledby="survived-title"><div class="debrief-section-head"><div><p class="debrief-kicker">01 / WHAT SURVIVED</p><h2 id="survived-title">The founding manifest</h2></div><span class="debrief-tally"><b>${preserved}</b> preserved <span>/</span> <b>${consumed}</b> consumed</span></div>
        <table class="debrief-manifest"><caption class="sr-only">Cargo kits preserved at arrival and consumed in voyage crises</caption><thead><tr><th scope="col">Cargo family</th><th scope="col">Preserved</th><th scope="col">Consumed</th></tr></thead><tbody>${manifest.map(f => `<tr class="manifest-${f.id}"><th scope="row"><span class="family-mark" aria-hidden="true">${f.id === 'habitat' ? '⌂' : f.id === 'industry' ? '◇' : '◎'}</span><div>${h(f.name)}<small>${f.id === 'habitat' ? 'Shelter & care' : f.id === 'industry' ? 'Repairs & fabrication' : 'Europa instruments'}</small></div></th><td>${f.count}<small>${f.points} pts</small></td><td>${f.used}<small>in crises</small></td></tr>`).join('')}</tbody></table>
        <p class="debrief-note">Counts are Cargo kits. ${otherRetired ? `${plural(otherRetired, 'additional kit')} retired through Ops; excluded from crisis consumption.` : 'No additional Cargo retired through Ops.'}</p>
      </section>
      <section class="debrief-sacrificed" aria-labelledby="sacrificed-title"><p class="debrief-kicker">02 / WHAT WAS SACRIFICED</p><h2 id="sacrificed-title">The cost of the crossing</h2><div class="debrief-costs"><div><strong>${workSpent}</strong><span>Work spent<br>on crises</span></div><div><strong>${lostPoints}</strong><span>Cargo points<br>retired</span></div></div>
        <div class="debrief-obligations"><div><h3>Carried into arrival</h3><span>${plural(score.burdens, 'Burden')}</span></div>${burdens.length ? `<ul>${burdens.map(b => `<li><span>${h(b.name)}</span><b>×${b.count}</b></li>`).join('')}</ul>` : '<p class="debrief-clear">No unresolved Burdens aboard.</p>'}<p class="debrief-note">${score.burdens ? 'Each unresolved Burden subtracts 1 arrival point.' : 'The founding expedition inherits no cruise Burdens.'}</p></div>
      </section>
    </div>
    <section class="debrief-choices" aria-labelledby="choices-title"><div class="debrief-section-head"><div><p class="debrief-kicker">DECISION RECORD / THE CROSSING</p><h2 id="choices-title">Choices that shaped the expedition</h2></div><span class="debrief-note">Payments recorded at the time; Burdens may later be retired.</span></div><ol>${state.crisisResults.map(crisisEntry).join('')}</ol></section>
    <section class="debrief-chapter" aria-labelledby="chapter-title"><div class="debrief-section-head"><div><p class="debrief-kicker">03 / WHAT HAPPENED NEXT</p><h2 id="chapter-title">The first foothold</h2></div><span class="debrief-note">${colony ? 'Callisto commissioning record' : 'Beyond the arrival manifest'}</span></div>${nextChapter(colony)}</section>
    <div class="debrief-actions"><button class="primary" data-action="${nextAction}">${nextLabel} <span aria-hidden="true">↗</span></button><button class="secondary" data-action="new">Chart another voyage</button><button class="text-button" data-action="replay">Replay this seed ↺</button></div>
    ${colony ? `<details class="debrief-record"><summary>Commissioning log</summary><div>${colony.history.map(line => `<p>${h(line)}</p>`).join('')}</div></details>` : ''}
    <footer class="debrief-footer"><span>JOVIAN WAKE <b>/</b> EXPEDITION REPORT</span><span>THE DISTANCE IS THE TEST.</span></footer>
  </main>`;
}

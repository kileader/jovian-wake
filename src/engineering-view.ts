import './style.css';
import './engineering.css';
import {
  CASES, CREW, SYSTEMS, SYSTEM_NAMES, actionUnavailable, cancelEngineeringJob, createEngineering,
  endEngineeringTurn, getReadings, jobName, setOperation, takeEngineeringAction, wearBand,
} from './engineering.ts';
import type { CaseId, CrewId, EngineeringAction, EngineeringState, Job, SystemId } from './engineering.ts';

const h = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const systemPurpose: Record<SystemId, string> = {
  power: 'Feeds the bus. Limited output leaves less power for recycling and project work.',
  cooling: 'Rejects equipment heat. Protected operation limits the bus to what cooling can sustain.',
  recycler: 'Recycles crew supplies. Any shortfall draws down the finite reserve.',
};

export function mountEngineering() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  document.title = 'Jovian Wake — Engineering experiment';
  const params = new URLSearchParams(location.search);
  let caseId = CASES.includes(params.get('case') as CaseId) ? params.get('case') as CaseId : CASES[0];
  let state = createEngineering(caseId);
  let started = false;
  let fullInfo = params.get('view') === 'full';
  let revealedAt: number | null = null;
  let selectedCrew: CrewId = 'engineer';
  let logOpen = false;
  let message = '';

  function restart() {
    state = createEngineering(caseId);
    started = true;
    revealedAt = fullInfo ? 1 : null;
    selectedCrew = 'engineer';
    logOpen = false;
    message = 'Watch 1 is ready. Read the meters and choose an assignment.';
    const url = new URL(location.href);
    url.searchParams.set('case', caseId);
    history.replaceState(null, '', url);
    render(true);
  }

  function header() {
    return `<header class="site-header eng-header"><a class="wordmark" href="?mode=engineering" aria-label="Engineering experiment briefing">◉ JOVIAN<span>WAKE</span><small>LAB</small></a><div class="header-right"><a class="text-button" href="./">Cruise prototype ↗</a>${started ? '<button class="text-button" data-ui="reset">New experiment</button>' : ''}</div></header>`;
  }

  function briefing() {
    return `<main class="eng-shell"><section class="eng-brief panel"><p class="eyebrow">ENGINEERING EXPERIMENT / EIGHT WATCHES</p><h1>What survives<br>the crossing.</h1><p class="eng-lead">The same machinery carries you to Callisto and keeps the first habitat alive. Its history comes with it.</p>
      <div class="eng-brief-grid"><div><h2>Your assignment</h2><p>Operate a transportable power, cooling, and recycling package through four cruise watches and four surface watches. Commission the habitat connection twice after arrival. Finish with recycling meeting demand and at least one reserve supply.</p><p>Europa observations are optional. Pursuing them competes for the same crew and capacity.</p></div><div><h2>Read. Investigate. Decide.</h2><p>Assign Mira and Alex once each per watch. Inspections reveal condition immediately; maintenance and repairs take effect now. Project work completes when you run the watch, if it receives enough power.</p><p>Basic meters are always available. Internal wear stays unknown until inspected; records show what was known at the time.</p></div></div>
      <div class="eng-case-controls"><label for="eng-case">STARTING CASE<select id="eng-case">${CASES.map(id => `<option ${id === caseId ? 'selected' : ''}>${id}</option>`).join('')}</select></label><label class="eng-check"><input id="eng-info" type="checkbox" ${fullInfo ? 'checked' : ''}> Show true condition throughout</label><button class="primary" data-ui="start">Begin experiment ↗</button></div>
      <p class="microcopy">Four fixed cases, including a healthy starting package. Replaying a case reproduces its starting conditions. These are abstract operating periods, not a trajectory or thermodynamic model. Reloading starts over.</p>
    </section>${rules()}</main>`;
  }

  function rules() {
    return `<details class="eng-rules panel"><summary>Operating rules & experiment boundaries</summary><div>
      <p>Each watch provides one assignment from each crew member. Mira's inspection gives exact wear; Alex's gives a condition band. Mira repairs up to 4 wear; Alex repairs up to 2. Every repair costs 1 spare, resets the service clock, and reduces that unit's capacity for the current watch. You can repair without inspecting.</p>
      <p>Routine maintenance removes up to 1 wear and resets the service clock. A unit gains 1 wear at each watch's end if its service age reaches 3 or more. All three units need maintenance. Service does not reveal their internal condition.</p>
      <p>Wear runs from 0 to 9. Power and cooling each start with capacity 8, losing 1 capacity per 2 wear (minimum 2). A repair test reduces that capacity by 2 for one watch. Recycler capacity starts at 3, losing 1 per 3 wear; a repair test temporarily removes another 1.</p>
      <p>Base loads take 2 power during cruise and 3 on the surface. Recycling requests up to 3 power. Each project requests 2. Cruise needs 2 recycled supplies per watch; the surface needs 3. Each unit of shortfall consumes 1 reserve supply. Surplus recycling does not refill reserves.</p>
      <p>Protected operation limits delivered power to the lower of power and cooling capacity. Override allows up to 2 extra power and bypasses the cooling limit. Exceeding either capacity adds 1 wear to that unit at watch's end. Operating settings persist until changed.</p>
      <p>Base loads always come first. You decide whether recycling or queued projects come next. Projects receive power in queue order. A stalled job spends the crew assignment but consumes no feedstock and earns no progress. Queued jobs can be cancelled before running the watch.</p>
      <p>Fabrication converts 1 feedstock into 2 spare parts. Habitat commissioning needs two completed assignments, starting on watch 5. One observation can be scheduled per watch. There are no random failure rolls; demand, condition, maintenance, and your choices determine consequences.</p>
      <p>The full-information view exposes condition without changing the rules. The final debrief reveals all actual causes. People have fixed expertise in this experiment; individual health, learning, and society are outside its scope.</p>
    </div></details>`;
  }

  function actionButton(action: EngineeringAction, label: string, detail: string) {
    const unavailable = actionUnavailable(state, selectedCrew, action);
    return `<button id="eng-act-${action.replace(':', '-')}" class="eng-action" data-eng-action="${action}" ${unavailable ? 'disabled' : ''}><strong>${label}</strong><span>${detail}</span><small>${h(unavailable || `Assign ${CREW[selectedCrew].name.split(' ')[0]}`)}</small></button>`;
  }

  function systemCard(id: SystemId) {
    const system = state.systems[id];
    const finding = system.finding;
    const ageText = system.serviceAge >= 2 ? `Service due · age ${system.serviceAge}` : `Service age ${system.serviceAge}`;
    return `<article class="eng-system panel"><div class="eng-system-head"><span class="eyebrow">U-01 / ${id.toUpperCase()}</span><span class="eng-tag ${system.serviceAge >= 2 ? 'warn' : ''}">${ageText}</span></div><h2>${SYSTEM_NAMES[id]}</h2><p>${systemPurpose[id]}</p>
      <div class="eng-finding">${fullInfo ? `<strong>True condition: ${system.wear}/9 wear · ${wearBand(system.wear)}</strong>` : '<strong>Internal condition requires inspection</strong>'}
      <span>${finding ? `Last finding: ${finding.wear !== null ? `${finding.wear}/9 wear` : finding.band} · watch ${finding.turn}, at inspection time` : 'No inspection on record.'}</span>${finding ? '<small>Later work and operation can change condition.</small>' : ''}${system.repaired ? '<span class="warn">Repair testing: reduced capacity this watch.</span>' : ''}</div>
      <div class="eng-system-actions">${actionButton(`inspect:${id}`, 'Inspect', 'Immediate evidence · 1 assignment')}${actionButton(`maintain:${id}`, 'Service', 'Remove up to 1 wear · reset service clock')}${actionButton(`repair:${id}`, 'Repair', '1 spare · reduced capacity this watch')}</div></article>`;
  }

  function readingsPanel() {
    const r = getReadings(state);
    return `<section class="eng-telemetry" aria-label="Live load check">
      <article class="panel"><span class="eyebrow">BUS DELIVERY / REQUEST</span><strong>${r.delivered}<small> / ${r.requested}</small></strong><p>${r.delivered < r.requested ? 'Some demand is unmet. Capacity or protective limiting may be responsible.' : 'The bus meets the current requested load.'}</p></article>
      <article class="panel"><span class="eyebrow">THERMAL TELEMETRY</span><strong class="eng-reading-word ${r.thermalStress ? 'warn' : ''}">${r.thermalStress ? 'Above limit' : 'Within limit'}</strong><p>${r.thermalStress ? 'This load will add cooling wear. Reduce demand or restore protection.' : 'Protection can reduce bus output to keep temperature within limits.'}</p></article>
      <article class="panel"><span class="eyebrow">RECYCLING / CREW NEED</span><strong>${r.output}<small> / ${r.demand}</small></strong><p>${r.reserveUse ? `Consumes ${r.reserveUse} reserve ${r.reserveUse === 1 ? 'supply' : 'supplies'} this watch. ${r.unmetDemand ? ` Stores cannot cover ${r.unmetDemand} additional supply demand.` : ' Investigate inputs and recycler condition.'}` : 'Crew needs are met at the current load.'}</p></article>
    </section>`;
  }

  function controls() {
    const r = getReadings(state);
    return `<section class="panel eng-operations" aria-labelledby="eng-operation-title"><div><p class="eyebrow">OPERATING SETTINGS</p><h2 id="eng-operation-title">Choose what gets the margin.</h2></div>
      <label for="eng-mode">CAPACITY LIMITS<select id="eng-mode"><option value="protected" ${state.mode === 'protected' ? 'selected' : ''}>Protected</option><option value="override" ${state.mode === 'override' ? 'selected' : ''}>Override limits</option></select></label>
      <label for="eng-priority">AFTER BASE LOADS<select id="eng-priority"><option value="life" ${state.priority === 'life' ? 'selected' : ''}>Life support first</option><option value="projects" ${state.priority === 'projects' ? 'selected' : ''}>Projects first</option></select></label>
      <p class="eng-operation-note">${state.mode === 'override' ? 'Override can increase output. Exceeding power or cooling capacity adds wear.' : 'Protection limits output to available power and cooling capacity.'} Settings carry into the next watch.</p></section>
      ${readingsPanel()}
      <section class="eng-crew panel" aria-label="Choose crew member"><div><p class="eyebrow">ASSIGN A CREW MEMBER</p><p>Inspections and equipment work happen immediately. Projects run at watch's end.</p></div><div class="eng-crew-options">${(Object.keys(CREW) as CrewId[]).map(id => `<button class="eng-person ${selectedCrew === id ? 'selected' : ''}" data-crew="${id}" aria-pressed="${selectedCrew === id}" ${state.available[id] ? '' : 'disabled'}><strong>${CREW[id].name}</strong><span>${CREW[id].role} · ${state.available[id] ? 'Ready' : 'Assigned'}</span><small>${id === 'engineer' ? 'Exact inspections · repair up to 4 wear' : 'Condition bands · repair up to 2 wear'}</small></button>`).join('')}</div></section>
      <section class="eng-systems" aria-label="Equipment and inspections">${SYSTEMS.map(systemCard).join('')}</section>
      <section class="panel eng-projects"><div class="eng-section-heading"><div><p class="eyebrow">MISSION & WORKSHOP</p><h2>Keep something moving.</h2></div><p>Each project needs 1 crew assignment and 2 power at watch's end.</p></div><div class="eng-project-buttons">
      ${actionButton('fabricate', 'Fabricate spares', '1 feedstock → 2 spares on completion')}
      ${actionButton('commission', `Connect habitat · ${state.habitat}/2`, 'Two completions needed after arrival')}
      ${actionButton('science', 'Observe Europa', '+1 observation · optional mission work')}</div>
      <div class="eng-queue" aria-label="Scheduled project work">${state.jobs.length ? `<h3>Scheduled work · allocated in this order</h3>${state.jobs.map((job, i) => `<div><span><strong>${h(jobName(job.kind))}</strong><small>${CREW[job.crew].name} · ${r.jobPower[i]}/2 power · ${r.jobPower[i] === 2 ? 'will complete' : 'will stall at this load'}</small></span><button class="text-button" data-cancel-job="${job.kind}">Cancel</button></div>`).join('')}` : '<p>No project work scheduled. Inspect, service, repair, or choose a project above.</p>'}</div></section>
      <section class="eng-run panel"><div><strong>${r.reserveUse ? `${r.reserveUse} reserve supplies will be consumed.` : 'Reserve supplies will hold.'}</strong><p>${Object.values(state.available).filter(Boolean).length} crew ${Object.values(state.available).filter(Boolean).length === 1 ? 'assignment' : 'assignments'} still available. ${state.turn === 4 ? 'Arrival next: base power and recycling demand rise by 1.' : state.turn === 8 ? 'Final watch: complete the habitat and meet recycling demand with reserves remaining.' : 'Running the watch applies loads, completes powered jobs, and ages equipment.'}</p>${r.reserveUse >= state.reserves ? '<p class="warn">This load will exhaust the remaining reserve supplies.</p>' : ''}</div><button class="primary" data-ui="end">Run watch ${state.turn}${state.turn === 4 ? ' & arrive' : ''} ↗</button></section>`;
  }

  function debrief() {
    const last = state.reports.at(-1)!;
    return `<section class="panel eng-debrief"><p class="eyebrow">COMMISSIONING ASSESSMENT / ${h(state.caseId)}</p><h1>${state.status === 'viable' ? 'The foothold holds.' : !state.reserves ? 'The margin ran out.' : 'The foothold is unfinished.'}</h1><p class="eng-lead">${state.status === 'viable' ? 'The habitat connection is complete and the recycler met final-watch demand. The remaining equipment and obligations belong to the settlement.' : !state.reserves ? 'Reserve supplies were exhausted. The history below shows how the shortfall developed.' : `The trial ended with habitat ${state.habitat}/2 and recycling ${last.output}/${last.demand}. Both must be complete with reserves remaining.`}</p>
      <p>${revealedAt === null ? 'Played with internal condition hidden.' : `Full information was consulted from watch ${revealedAt}.`} All actual causes are now revealed for review.</p>
      <div class="eng-end-condition">${SYSTEMS.map(id => `<article><span>${SYSTEM_NAMES[id]}</span><strong>${state.systems[id].wear}/9 wear</strong><small>Service age ${state.systems[id].serviceAge}</small></article>`).join('')}</div>
      <div class="eng-table-wrap"><table><caption>What happened each watch</caption><thead><tr><th>Watch</th><th>Bus</th><th>Recycling</th><th>Reserves used</th><th>Project results</th></tr></thead><tbody>${state.reports.map(r => `<tr><th>${r.turn}${r.turn === 5 ? ' · Callisto' : ''}</th><td>${r.delivered}/${r.requested}</td><td>${r.output}/${r.demand}</td><td>${r.reserveUse}</td><td>${r.jobs.map(job => `${h(jobName(job.kind))}: ${job.complete ? 'complete' : 'stalled'}`).join('<br>') || 'None scheduled'}</td></tr>`).join('')}</tbody></table></div>
      <div class="eng-debrief-actions"><button class="primary" data-ui="replay">Replay this case ↺</button><button class="secondary" data-ui="briefing">Choose another case</button><button class="secondary" data-ui="export">View run record</button></div>
      <p class="microcopy">Playtest prompts: Did evidence change your choice? Was a workaround worthwhile? Which earlier decision explains your final condition? Compare a different route or the full-information view.</p></section>`;
  }

  function historyPanel() {
    const reveal = fullInfo || state.status !== 'active';
    return `<details class="eng-history panel" ${logOpen || state.status !== 'active' ? 'open' : ''}><summary>${reveal ? 'CAUSAL HISTORY · observations and true condition' : 'CREW RECORD · actions and observations'} (${state.history.length})</summary><div>${[...state.history].reverse().map(entry => `<article><span class="eyebrow">WATCH ${entry.turn}</span><p>${h(entry.text)}</p>${reveal && entry.truth ? `<p class="eng-truth"><strong>Actual cause / condition:</strong> ${h(entry.truth)}</p>` : ''}</article>`).join('')}</div></details>`;
  }

  function render(focus = false) {
    const focused = document.activeElement as HTMLElement | null;
    const previousKey = focused?.id || '';
    const finished = state.status !== 'active';
    app.innerHTML = header() + (!started ? briefing() : `<main class="eng-shell" data-watch="${state.turn}" data-status="${state.status}">
      <div class="mission-nav"><span>U-01 / ${state.turn < 5 ? 'LATE CRUISE' : 'CALLISTO COMMISSIONING'}</span><span>${h(state.caseId)} · WATCH ${state.turn}/8</span></div>
      <div class="eng-track" aria-label="Expedition progress">${Array.from({ length: 8 }, (_, i) => `<span class="${i + 1 < state.turn || (finished && i + 1 === state.turn) ? 'passed' : ''} ${i + 1 === state.turn ? 'current' : ''}">${i + 1 === 5 ? '↓ ' : ''}${i + 1}</span>`).join('')}</div>
      ${finished ? '' : `<section class="eng-intro"><div><p class="eyebrow">${state.turn < 5 ? 'THE LAST CRUISE WATCHES' : 'THE SAME MACHINES. A NEW LOAD.'}</p><h1 id="eng-watch-title" tabindex="-1">${state.turn === 5 ? 'Your history has landed.' : 'Keep the expedition working.'}</h1><p>${state.turn === 5 ? 'The utility package now serves the surface habitat. Base demand and recycling needs have increased; condition and records carry forward.' : 'Check the load, select a crew member, and assign useful work. Readings update as you change the plan.'}</p></div><label class="eng-check"><input id="eng-info" type="checkbox" ${fullInfo ? 'checked' : ''}> Show true condition</label></section>`}
      <section class="eng-stores" aria-label="Expedition stores">${[['RESERVE SUPPLIES', state.reserves], ['SPARE PARTS', state.spares], ['FEEDSTOCK', state.feedstock], ['HABITAT CONNECTION', `${state.habitat}/2`], ['OBSERVATIONS', state.science]].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join('')}</section>
      ${finished ? debrief() : controls()}
      <p class="eng-message" role="status">${h(message)}</p>${historyPanel()}${rules()}<footer><span>JOVIAN WAKE / ENGINEERING EXPERIMENT</span><span>CONDITION BECOMES HISTORY.</span></footer></main>`)
      + `<dialog id="eng-reset-dialog" aria-labelledby="eng-reset-title"><h2 id="eng-reset-title">Start another experiment?</h2><p>This run will be discarded. Its progress is not saved across reloads.</p><div class="eng-debrief-actions"><button class="secondary" data-ui="cancel-reset">Keep playing</button><button class="primary" data-ui="briefing">Choose a case</button></div></dialog>
      <dialog id="eng-record-dialog" aria-labelledby="eng-record-title"><h2 id="eng-record-title">Run record</h2><p>Copy this JSON for a playtest record, or download it. It includes the starting case, crew actions, operating settings, and actual equipment history.</p><textarea id="eng-record" aria-label="Run record JSON" readonly spellcheck="false"></textarea><div class="eng-debrief-actions"><a id="eng-download" class="primary">Download JSON</a><button class="secondary" data-ui="close-record">Close record</button></div></dialog>`;
    app.querySelector('.eng-history')?.addEventListener('toggle', e => { logOpen = (e.target as HTMLDetailsElement).open; });
    if (focus) {
      const target = app.querySelector<HTMLElement>('#eng-watch-title, .eng-debrief h1, .eng-brief h1');
      target?.setAttribute('tabindex', '-1'); target?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (previousKey) {
      const previous = app.querySelector<HTMLElement>(`#${previousKey}`);
      const target = previous && !previous.matches(':disabled') ? previous : app.querySelector<HTMLElement>('[data-ui="end"]');
      target?.focus({ preventScroll: true });
    }
  }

  app.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.crew) { selectedCrew = button.dataset.crew as CrewId; render(); return; }
    if (button.dataset.engAction) {
      const next = takeEngineeringAction(state, selectedCrew, button.dataset.engAction as EngineeringAction);
      if (next === state) return;
      state = next;
      message = state.history.at(-1)!.text;
      selectedCrew = ((Object.keys(CREW) as CrewId[]).find(id => state.available[id])) ?? selectedCrew;
      render(); return;
    }
    if (button.dataset.cancelJob) { state = cancelEngineeringJob(state, button.dataset.cancelJob as Job); selectedCrew = (Object.keys(CREW) as CrewId[]).find(id => state.available[id]) ?? selectedCrew; message = state.history.at(-1)!.text; render(); return; }
    switch (button.dataset.ui) {
      case 'start': case 'replay': restart(); break;
      case 'end': {
        const lastTurn = state.turn;
        state = endEngineeringTurn(state);
        selectedCrew = 'engineer';
        const report = state.reports.at(-1)!;
        message = `Watch ${lastTurn} complete. ${report.jobs.filter(j => j.complete).length} projects completed; ${report.reserveUse} reserve supplies consumed. ${state.turn === 5 && state.status === 'active' ? 'Arrived at Callisto.' : ''}`;
        render(true); break;
      }
      case 'reset': app.querySelector<HTMLDialogElement>('#eng-reset-dialog')!.showModal(); break;
      case 'cancel-reset': app.querySelector<HTMLDialogElement>('#eng-reset-dialog')!.close(); break;
      case 'briefing': started = false; message = ''; render(true); break;
      case 'export': {
        if (state.status === 'active') break;
        const json = JSON.stringify({ format: 'jovian-wake-engineering-1', revealedAt, state }, null, 2);
        app.querySelector<HTMLTextAreaElement>('#eng-record')!.value = json;
        const link = app.querySelector<HTMLAnchorElement>('#eng-download')!;
        link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
        link.download = `${state.caseId.toLowerCase()}-engineering.json`;
        app.querySelector<HTMLDialogElement>('#eng-record-dialog')!.showModal();
        const record = app.querySelector<HTMLTextAreaElement>('#eng-record')!;
        record.setSelectionRange(0, 0);
        record.scrollTop = 0;
        break;
      }
      case 'close-record': app.querySelector<HTMLDialogElement>('#eng-record-dialog')!.close(); break;
    }
  });

  app.addEventListener('change', event => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.id === 'eng-case') caseId = input.value as CaseId;
    if (input.id === 'eng-info') {
      fullInfo = (input as HTMLInputElement).checked;
      if (fullInfo && started && revealedAt === null) revealedAt = state.turn;
      render();
    }
    if (input.id === 'eng-mode' || input.id === 'eng-priority') {
      state = setOperation(state, app.querySelector<HTMLSelectElement>('#eng-mode')!.value as EngineeringState['mode'], app.querySelector<HTMLSelectElement>('#eng-priority')!.value as EngineeringState['priority']);
      message = 'Load check updated. Settings persist until changed.';
      render();
    }
  });
  render();
}

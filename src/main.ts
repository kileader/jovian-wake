import './style.css';
import { PROJECTS } from './content.ts';
import { advanceMonth, availableChoices, choose, createGame, describeEffect, getCurrentEvent, monthlyUpkeep, projectById, startProject } from './engine.ts';
import type { Choice, GameState, ProjectId, Stat } from './types.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const initialSeed = new URLSearchParams(location.search).get('seed')?.trim().slice(0, 80) || 'CALLISTO-01';
let state = createGame(initialSeed);
let logOpen = false;
let projectListOpen = false;
const labels: Record<Stat, string> = { ship: 'Ship', crew: 'Crew', supplies: 'Supplies', readiness: 'Readiness' };
const subtitles: Record<Stat, string> = { ship: 'Hull & systems', crew: 'Health & cohesion', supplies: 'Consumables & spares', readiness: 'Callisto preparation' };
const h = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pad = (value: number) => String(value).padStart(2, '0');
const terminal = () => state.phase === 'arrived' || state.phase === 'failed';
const arrow = '<span aria-hidden="true">↗</span>';

function statCards() {
  return (Object.keys(labels) as Stat[]).map(key => {
    const value = state.stats[key];
    const low = key !== 'readiness' && value <= 25;
    return `<article class="stat-card ${low ? 'critical' : ''}">
      <div class="stat-top"><span>${labels[key]}</span><span class="stat-symbol" aria-hidden="true">${{ ship: '◇', crew: '⌘', supplies: '▤', readiness: '◎' }[key]}</span></div>
      <div class="stat-value">${value}<span>/ 100</span>${low ? '<small>CRITICAL</small>' : ''}</div>
      <div class="meter" role="meter" aria-label="${labels[key]}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i></div>
      <p>${subtitles[key]}</p>
    </article>`;
  }).join('');
}

function hero() {
  return `<section class="hero ${state.month > 0 && !terminal() ? 'cruising' : ''}" aria-label="Voyage progress">
    <div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> ${state.phase === 'arrived' ? 'JOVIAN SYSTEM / ARRIVAL' : state.phase === 'failed' ? 'EXPEDITION / SIGNAL LOST' : 'EXPEDITION 01 / OUTBOUND'}</p>
      <h1>${state.month === 0 ? 'The long way out.' : state.phase === 'arrived' ? 'A new world ahead.' : state.phase === 'failed' ? 'A voyage unfinished.' : 'Everything we have\nis on this ship.'}</h1>
      <p class="hero-description">30 people. 24 months. One way to Jupiter.</p>
      <div class="journey-labels"><span>EARTH</span><span>${state.month === 0 ? 'DEPARTURE' : `MONTH ${pad(state.month)} / 24`}</span><span>CALLISTO</span></div>
      <div class="journey-track" aria-label="Month ${state.month} of 24">${Array.from({ length: 24 }, (_, i) => `<i class="${i < state.month ? 'passed' : ''}"></i>`).join('')}</div>
    </div>
    <div class="space-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="planet"></div><div class="moon"></div><div class="ship-marker">✧</div><span class="planet-label">JUPITER SYSTEM<br><b>05.2 AU · SOL</b></span><span class="schematic">ARTIST’S IMPRESSION</span></div>
  </section>`;
}

function projectPanel() {
  const active = state.activeProject;
  const p = active && projectById(active.id);
  const available = PROJECTS.filter(project => !state.completedProjects.includes(project.id));
  return `<aside class="project-panel panel" aria-label="Long-term project"><div class="section-label"><span>THE WORK BETWEEN</span><span aria-hidden="true">↗</span></div>
    <h2>Build for the arrival.</h2>
    ${p && active ? `<div class="active-project"><p class="eyebrow">${terminal() ? 'UNFINISHED' : active.delay ? 'CREW DIVERTED' : 'IN PROGRESS'}</p><h3>${h(p.name)}</h3><p>${h(p.description)}</p>
      <div class="project-progress"><span>${active.progress} / ${p.duration} months</span><span>${terminal() ? 'Work ended with the cruise' : active.delay ? `${active.delay} month pause` : 'Advances automatically'}</span></div>
      <div class="meter project-meter"><i style="width:${active.progress / p.duration * 100}%"></i></div>
      <p class="benefit">${h(p.benefit)}<br>On completion: ${h(describeEffect(p.completion).join(' · '))}</p></div>` : `<p class="aside-intro">${terminal() ? 'The work you carried across the dark.' : 'One major project at a time. Your crew does the work each month.'}</p>
      ${!terminal() && available.length ? `<div class="project-options">${available.map(project => `<button class="project-option" data-project="${project.id}" ${state.phase !== 'ready' ? 'disabled' : ''}>
      <span class="project-option-top"><strong>${h(project.name)}</strong><span>${project.duration} MO</span></span><span class="project-detail">${h(project.benefit)}</span><span class="project-reward">On completion: ${h(describeEffect(project.completion).join(' · '))}</span>
      ${24 - state.month < project.duration ? '<span class="late-note">Not enough months left to finish</span>' : ''}</button>`).join('')}</div>
      ${state.phase === 'decision' ? '<p class="microcopy">Resolve this month’s decision before starting a project.</p>' : ''}` : ''}`}
    ${p && !terminal() ? `<details class="future-projects" ${projectListOpen ? 'open' : ''}><summary>Other project paths</summary>${PROJECTS.filter(project => project.id !== p.id && !state.completedProjects.includes(project.id)).map(project => `<p><strong>${h(project.name)} · ${project.duration} mo</strong><br>${h(project.benefit)}</p>`).join('')}</details>` : ''}
    ${state.completedProjects.length ? `<div class="completed-projects"><p class="eyebrow">PERMANENT ADVANTAGES / ${state.completedProjects.length}</p>${state.completedProjects.map(id => `<p><span class="check">✓</span><span><strong>${h(projectById(id).name)}</strong><small>${h(projectById(id).benefit)}</small></span></p>`).join('')}</div>` : ''}
    <div class="aside-footnote"><span aria-hidden="true">◎</span><p>Callisto is the foothold.<br>Europa is the reason.</p></div>
  </aside>`;
}

function choiceButton(choice: Choice, index: number) {
  const enabled = availableChoices(state).some(c => c.id === choice.id);
  const event = getCurrentEvent(state)!;
  let reason = '';
  if (choice.requiresProject && !state.completedProjects.includes(choice.requiresProject)) reason = `Requires ${projectById(choice.requiresProject).name}`;
  else if (choice.requiresActiveProject && !state.activeProject) reason = 'Requires an active project';
  else if (!enabled) reason = 'Insufficient supplies';
  const effects = describeEffect(choice.effect, state, event.category);
  return `<button class="choice ${choice.requiresProject ? 'project-choice' : ''}" data-choice="${h(choice.id)}" ${enabled ? '' : 'disabled'}>
    <span class="choice-number">${pad(index + 1)}</span><span class="choice-content"><strong>${h(choice.label)}</strong><span class="choice-description">${h(choice.description)}</span>
    <span class="effects">${effects.map(effect => `<span>${h(effect)}</span>`).join('')}</span>${reason ? `<span class="locked-reason">${h(reason)}</span>` : ''}</span><span class="choice-arrow" aria-hidden="true">↗</span></button>`;
}

function intro() {
  return `<div class="dispatch-header"><span class="eyebrow">CAPTAIN’S BRIEFING</span><span class="dispatch-id">00 / 24</span></div>
    <h2 id="dispatch-title" tabindex="-1">There is no resupply.</h2>
    <p class="dispatch-body">Life has been confirmed beneath Europa’s ice. Thirty people are leaving Earth to establish humanity’s first foothold in the Jovian system. You are their captain.</p>
    <p class="dispatch-body">For the next two years, this ship is your whole world. Keep it working, keep your crew together, and decide what kind of expedition will arrive at Callisto.</p>
    <ol class="briefing-steps"><li><span>01</span><div><strong>Choose a project</strong><p>Pick a direction for the crew. Progress is automatic.</p></div></li><li><span>02</span><div><strong>Take it one month at a time</strong><p>Respond to a problem, or make use of the quiet.</p></div></li><li><span>03</span><div><strong>Live with your decisions</strong><p>Some costs are immediate. Others follow you.</p></div></li></ol>
    <div class="launch-controls"><label class="seed-label" for="launch-seed">VOYAGE SEED<input id="launch-seed" maxlength="80" value="${h(state.seed)}" autocomplete="off" spellcheck="false"></label><button class="primary" data-action="advance">Begin the cruise ${arrow}</button></div>
    <p class="microcopy">${state.activeProject ? `${h(projectById(state.activeProject.id).name)} selected. Your crew is ready.` : 'Select a project, or begin without one.'} No timers. Take your time.</p>`;
}

function monthReport() {
  const entries = state.log.filter(entry => entry.month === state.month && entry.kind !== 'routine');
  const decision = [...entries].reverse().find(entry => entry.kind === 'choice');
  return `<div class="dispatch-header"><span class="eyebrow">MONTH ${pad(state.month)} / CAPTAIN’S LOG</span><span class="status-tag">RECORDED</span></div>
    <h2 id="dispatch-title" tabindex="-1">${h(decision?.title || 'A month behind us.')}</h2>
    <p class="dispatch-body">${h(decision?.text || 'The crew settles into the routine of the voyage.')}</p>
    ${decision?.changes ? changeBadges(decision.changes) : ''}
    ${entries.filter(entry => entry.kind === 'project').map(entry => `<div class="month-note"><span aria-hidden="true">◎</span><div><strong>${h(entry.title)}</strong><p>${h(entry.text)}</p></div></div>`).join('')}
    <div class="interlude"><span class="eyebrow">BEYOND THE WINDOWS</span><p>${quietLine()}</p></div>
    <div class="continue-row"><div><span class="eyebrow">NEXT MONTH</span><p>${h(describeUpkeep())}</p></div><button class="primary" data-action="advance">Continue to month ${pad(state.month + 1)} ${arrow}</button></div>
    ${!state.activeProject && state.completedProjects.length < 5 ? '<p class="microcopy">Your project slot is open. You can start the next project before continuing.</p>' : ''}`;
}

function changeBadges(changes: Partial<GameState['stats']>) {
  return `<div class="result-changes">${Object.entries(changes).filter(([, v]) => v !== 0).map(([key, value]) => `<span class="${value! > 0 ? 'positive' : 'negative'}">${labels[key as Stat]} ${value! > 0 ? '+' : ''}${value}</span>`).join('')}</div>`;
}

function quietLine() {
  return [
    'Earth is still out there. It just takes a little longer to answer.',
    'The stars do not move. The ventilation never stops.',
    'Somewhere behind you, an ordinary day is happening on Earth.',
    'A familiar voice arrives from a world that keeps turning without you.',
    'In the galley, someone has marked another month on the wall.',
    'Jupiter is a little brighter now. There is still work to do.',
  ][Math.min(5, Math.floor(state.month / 4))];
}

function describeUpkeep() {
  const upkeep = monthlyUpkeep(state);
  return (Object.entries(upkeep) as [Stat, number][]).filter(([, v]) => v !== 0).map(([key, value]) => `${labels[key]} ${value}`).join(' · ') || 'Routine wear offset by your projects';
}

function endReport() {
  const arrived = state.phase === 'arrived';
  const readiness = state.stats.readiness;
  const notes = state.log.filter(entry => entry.kind === 'consequence');
  const scienceLabel = state.science >= 40 ? 'A research program ready to begin' : state.science >= 15 ? 'A foundation for Europa science' : 'The discovery is only the beginning';
  return `<div class="dispatch-header"><span class="eyebrow">${arrived ? 'MONTH 24 / ARRIVAL ASSESSMENT' : `MONTH ${pad(state.month)} / END OF VOYAGE`}</span><span class="status-tag">${arrived ? 'CRUISE COMPLETE' : 'EXPEDITION LOST'}</span></div>
    <h2 id="dispatch-title" tabindex="-1">${arrived ? 'You brought them this far.' : 'The margin ran out.'}</h2>
    <p class="dispatch-body">${arrived ? 'Callisto fills the forward cameras. Everything you protected, built, and put off during the crossing has arrived with you.' : `${state.stats.ship <= 0 ? 'The ship’s remaining systems can no longer support the crossing.' : state.stats.crew <= 0 ? 'The crew can no longer sustain safe ship operations.' : 'The last usable reserves have been exhausted.'} The expedition cannot continue.`}</p>
    <div class="arrival-assessment"><div><span class="eyebrow">CALLISTO / READINESS ${readiness}</span><h3>${!arrived ? 'Plans without a foothold.' : readiness >= 65 ? 'Ready to build.' : readiness >= 35 ? 'A fragile foothold.' : 'A difficult beginning.'}</h3><p>${!arrived ? 'The crew’s preparation could not compensate for the loss of the expedition’s essential systems or reserves.' : readiness >= 65 ? 'The rehearsals and prepared systems give the settlement a strong start.' : readiness >= 35 ? 'You have a foundation. The first settlement crews will have little room for error.' : 'Much of the work you hoped to finish in transit remains ahead.'}</p></div><div><span class="eyebrow">EUROPA / SCIENCE ${state.science}</span><h3>${!arrived ? 'The work in the archive.' : scienceLabel}</h3><p>${arrived && state.science >= 40 ? 'A tested scientific workflow and a growing archive are ready for the next expedition phase.' : 'The archive records what your crew could learn during the crossing.'}</p></div></div>
    ${state.activeProject ? `<p class="unfinished">Unfinished work: ${h(projectById(state.activeProject.id).name)} (${state.activeProject.progress}/${projectById(state.activeProject.id).duration} months).</p>` : ''}
    ${notes.length ? `<div class="arrival-notes"><span class="eyebrow">WHAT THE VOYAGE LEFT YOU</span>${notes.map(entry => `<p><span>M${pad(entry.month)}</span><strong>${h(entry.title)}</strong> ${h(entry.text)}</p>`).join('')}</div>` : ''}
    ${state.pending.length ? `<p class="unfinished">${state.pending.length} unresolved consequence${state.pending.length === 1 ? '' : 's'} may outlast the crossing.</p>` : ''}
    <div class="end-actions"><button class="primary" data-action="new">Chart another voyage ${arrow}</button><button class="text-button" data-action="replay">Replay this seed ↺</button></div>
    <p class="microcopy">${arrived ? 'End of Prototype 0.1. Settlement and surface operations are beyond this voyage.' : 'Try a different project order or leave a wider reserve.'}</p>`;
}

function dispatch() {
  if (terminal()) return endReport();
  if (state.month === 0) return intro();
  if (state.phase === 'ready') return monthReport();
  const event = getCurrentEvent(state)!;
  const completions = state.log.filter(entry => entry.month === state.month && entry.kind === 'project' && !entry.title.startsWith('Started'));
  return `<div class="dispatch-header"><span class="eyebrow">${event.id === 'quiet' ? 'A QUIET MONTH' : h(event.category).toUpperCase()} / MONTH ${pad(state.month)}</span><span class="dispatch-id">${pad(state.month)} / 24</span></div>
    <h2 id="dispatch-title" tabindex="-1">${h(event.title)}</h2><p class="dispatch-body">${h(event.body)}</p>
    ${completions.map(entry => `<div class="completion-notice"><span aria-hidden="true">${entry.title.startsWith('Completed') ? '✓' : 'Ⅱ'}</span><span><strong>${h(entry.title)}</strong><br>${h(entry.text)}</span></div>`).join('')}
    <div class="decision-label"><span class="eyebrow">YOUR CALL, CAPTAIN</span><span>Choose one</span></div>
    <div class="choices">${event.choices.filter(c => !c.requiresFlag || state.flags.includes(c.requiresFlag)).map(choiceButton).join('')}</div>
    <p class="microcopy">Costs include your completed project benefits. Choices are final for this voyage.</p>`;
}

function logPanel() {
  return `<details class="voyage-log" ${logOpen ? 'open' : ''}><summary><span>VOYAGE LOG <span class="log-count">${state.log.length} ENTRIES</span></span><span aria-hidden="true">+</span></summary>
    <div class="log-entries">${state.log.length ? [...state.log].reverse().map(entry => `<article><span class="log-month">M${pad(entry.month)}</span><div><h3>${h(entry.title)}</h3><p>${h(entry.text)}</p>${entry.changes ? changeBadges(entry.changes) : ''}</div></article>`).join('') : '<p>The voyage has yet to begin.</p>'}</div></details>`;
}

function render(focus = false) {
  app.innerHTML = `<header class="site-header"><a class="wordmark" href="./" aria-label="Jovian Wake home"><span class="brand-orbit" aria-hidden="true">◉</span> JOVIAN<span>WAKE</span><small>0.1</small></a><div class="header-right"><span class="prototype-label">A CRUISE PROTOTYPE</span><button class="text-button" data-action="restart">New voyage <span aria-hidden="true">↗</span></button></div></header>
    <main><div class="mission-nav"><span><span class="nav-mark" aria-hidden="true">▰</span> EXPEDITION CONTROL</span><span class="seed-display">SEED / ${h(state.seed)}</span></div>${hero()}
    <section class="stats" aria-label="Expedition conditions">${statCards()}</section>
    <div class="game-layout"><section class="dispatch panel" aria-labelledby="dispatch-title" aria-live="polite">${dispatch()}</section>${projectPanel()}</div>
    ${logPanel()}
    <details class="how-to"><summary>How the voyage works</summary><p>Begin a month to apply routine wear, progress your project, and receive one decision. Projects run until complete; diverted crew pause work for future months. An unfilled project slot can be used between months. Supplies pay for consumables and replacement parts; they are not a literal food percentage.</p><p>All four conditions use a 0–100 scale. Reaching zero Ship, Crew, or Supplies ends the voyage; Readiness measures preparation and can safely be zero. Event costs show project protection before you choose. Quiet months recur; other events are drawn once per run. The same seed and decisions reproduce the same voyage. This prototype ends at Month 24 and does not save across reloads.</p></details>
    <footer><span>JOVIAN WAKE <b>/</b> PROTOTYPE 0.1</span><span>THE DISTANCE IS THE TEST.</span></footer></main>
    <dialog id="restart-dialog" aria-labelledby="restart-title"><form id="restart-form"><p class="eyebrow">A DIFFERENT CROSSING</p><h2 id="restart-title">Chart a new voyage.</h2><p>${state.month > 0 && !terminal() ? 'Starting again will end your current voyage. ' : ''}Use the same seed to revisit the same possibilities. Your choices still shape the outcome.</p><label class="seed-label" for="restart-seed">VOYAGE SEED<input id="restart-seed" name="seed" maxlength="80" required autocomplete="off" spellcheck="false" value="${h(state.seed)}"></label><div class="dialog-actions"><button type="button" class="text-button" data-action="random-seed">Generate seed ↺</button><div><button type="button" class="secondary" data-action="cancel-restart">Cancel</button><button type="submit" class="primary">Begin again ↗</button></div></div></form></dialog>`;
  app.querySelector<HTMLDetailsElement>('.voyage-log')!.addEventListener('toggle', event => { logOpen = (event.target as HTMLDetailsElement).open; });
  app.querySelector<HTMLDetailsElement>('.future-projects')?.addEventListener('toggle', event => { projectListOpen = (event.target as HTMLDetailsElement).open; });
  if (focus) {
    const heading = app.querySelector<HTMLElement>('#dispatch-title');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'nearest' });
  }
}

function reset(seed: string) {
  state = createGame(seed.trim().slice(0, 80) || 'CALLISTO-01');
  logOpen = false;
  projectListOpen = false;
  const url = new URL(location.href);
  url.searchParams.set('seed', state.seed);
  history.replaceState(null, '', url);
  render(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  if (button.dataset.project) {
    const seedInput = app.querySelector<HTMLInputElement>('#launch-seed');
    if (seedInput && seedInput.value.trim() !== state.seed) state = createGame(seedInput.value.trim().slice(0, 80) || 'CALLISTO-01');
    state = startProject(state, button.dataset.project as ProjectId);
    render(true);
  } else if (button.dataset.choice) {
    state = choose(state, button.dataset.choice);
    render(true);
  } else {
    const dialog = app.querySelector<HTMLDialogElement>('#restart-dialog')!;
    switch (button.dataset.action) {
      case 'advance': {
        const seedInput = app.querySelector<HTMLInputElement>('#launch-seed');
        if (seedInput && seedInput.value.trim() !== state.seed) {
          const projectId = state.activeProject?.id;
          state = createGame(seedInput.value.trim().slice(0, 80) || 'CALLISTO-01');
          if (projectId) state = startProject(state, projectId);
        }
        state = advanceMonth(state);
        render(true);
        break;
      }
      case 'restart': dialog.showModal(); break;
      case 'new': dialog.showModal(); app.querySelector<HTMLInputElement>('#restart-seed')!.value = `CALLISTO-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`; break;
      case 'replay': reset(state.seed); break;
      case 'cancel-restart': dialog.close(); break;
      case 'random-seed': app.querySelector<HTMLInputElement>('#restart-seed')!.value = `CALLISTO-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`; break;
    }
  }
});

app.addEventListener('submit', event => {
  if ((event.target as HTMLElement).id !== 'restart-form') return;
  event.preventDefault();
  reset(app.querySelector<HTMLInputElement>('#restart-seed')!.value);
});

render();

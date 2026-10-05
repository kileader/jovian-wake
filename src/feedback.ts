import { cardById, getScore, ownedCards } from './engine.ts';
import { CRISES } from './content.ts';
import type { GameState } from './types.ts';
import type { createSoundController, SoundCue } from './sound.ts';

interface CardView { element: HTMLElement; rect: DOMRect }
type Views = Map<string, CardView>;

// Presentation observes completed transitions; it never consumes engine randomness.
export function createFeedback(app: HTMLElement, sound: ReturnType<typeof createSoundController>) {
  const layer = document.createElement('div');
  layer.className = 'feedback-layer';
  layer.setAttribute('aria-hidden', 'true');
  const notice = document.createElement('div');
  notice.className = 'action-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-atomic', 'true');
  document.body.append(layer);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set<Animation>();
  const deals = new Map<HTMLElement, number>();
  const dealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || !deals.has(entry.target as HTMLElement)) return;
      const element = entry.target as HTMLElement;
      const delay = deals.get(element) ?? 0;
      deals.delete(element);
      dealObserver.unobserve(element);
      element.classList.remove('dealing-card');
      if (app.contains(element)) animate(element, [{ opacity: 0, transform: 'translate(24px, 28px) rotate(4deg)' }, { opacity: 1, transform: 'none' }], 340, delay);
    });
  }, { threshold: 0.15 });
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  function clear() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
    deals.forEach((_, element) => element.classList.remove('dealing-card'));
    deals.clear();
    dealObserver.disconnect();
    layer.replaceChildren();
    notice.replaceChildren();
    notice.classList.remove('visible');
    clearTimeout(noticeTimer);
    sound.silence();
  }
  motion.addEventListener('change', clear);

  function capture(): Views {
    clear();
    const views: Views = new Map();
    app.querySelectorAll<HTMLElement>('[data-card], [data-supply-card], [data-inspect-card]').forEach(element => {
      const key = element.dataset.supplyCard ? `supply:${element.dataset.supplyCard}` : element.dataset.card ?? element.dataset.inspectCard!;
      views.set(key, { element: element.cloneNode(true) as HTMLElement, rect: element.getBoundingClientRect() });
    });
    return views;
  }

  function animate(element: HTMLElement, frames: Keyframe[], duration = 360, delay = 0) {
    if (motion.matches) return;
    const animation = element.animate(frames, { duration, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    animations.add(animation);
    animation.onfinish = () => { animations.delete(animation); if (element.parentElement === layer) element.remove(); };
  }

  function visible(rect: DOMRect) {
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }

  function message(title: string, detail: string, cue: SoundCue, count = 1) {
    const heading = document.createElement('strong');
    heading.textContent = title;
    const description = document.createElement('span');
    description.textContent = detail;
    notice.replaceChildren(heading, description);
    notice.title = `${title} · ${detail}`;
    notice.dataset.cue = cue;
    notice.classList.add('visible');
    noticeTimer = setTimeout(() => notice.classList.remove('visible'), 2200);
    sound.play(cue, count);
  }

  function flight(view: CardView | undefined, destination: HTMLElement | null, retire = false, delay = 0) {
    if (!view || motion.matches || !visible(view.rect)) return;
    const { element, rect } = view;
    const ghost = element.cloneNode(true) as HTMLElement;
    ghost.classList.remove('selected');
    ghost.classList.add('feedback-card');
    ghost.inert = true;
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    layer.append(ghost);
    const target = destination?.getBoundingClientRect();
    // Fade locally if neither a destination nor the inline feedback is on screen.
    const feedback = notice.getBoundingClientRect();
    const end = target && visible(target) ? target : visible(feedback) ? feedback : rect;
    const x = retire ? 0 : end.left + end.width / 2 - rect.left - rect.width / 2;
    const y = retire ? -55 : end.top + end.height / 2 - rect.top - rect.height / 2;
    animate(ghost, [
      { opacity: 1, transform: 'translate(0, 0) scale(1) rotate(0)' },
      { opacity: retire ? 0.6 : 0.85, offset: 0.6, transform: `translate(${x * 0.65}px, ${y * 0.65}px) scale(${retire ? 0.85 : 0.6}) rotate(${retire ? -7 : 3}deg)` },
      { opacity: 0, transform: `translate(${x}px, ${y}px) scale(${retire ? 0.65 : 0.22}) rotate(${retire ? -12 : 0}deg)` },
    ], retire ? 420 : 460, delay);
  }

  function show(before: GameState, after: GameState, views: Views) {
    const slot = app.querySelector('[data-feedback-slot]');
    if (slot) slot.append(notice);
    else notice.remove();
    const beforeOwned = new Set(ownedCards(before).map(card => card.uid));
    const beforeHand = new Set(before.hand.map(card => card.uid));
    const beforeDiscard = new Set(before.discard.map(card => card.uid));
    const beforeRetired = new Set(before.retired.map(card => card.uid));
    const played = after.inPlay.filter(card => beforeHand.has(card.uid));
    const retired = after.retired.filter(card => !beforeRetired.has(card.uid));
    const gained = ownedCards(after).filter(card => !beforeOwned.has(card.uid) && cardById(card.id).type !== 'Burden');
    const burdens = ownedCards(after).filter(card => !beforeOwned.has(card.uid) && cardById(card.id).type === 'Burden');
    const drawn = after.hand.filter(card => !beforeHand.has(card.uid));
    const moved = new Set([...played, ...retired].map(card => card.uid));
    const discarded = after.discard.filter(card => beforeOwned.has(card.uid) && !beforeDiscard.has(card.uid) && !moved.has(card.uid));
    const work = after.month === before.month ? after.workGenerated - before.workGenerated : 0;
    const crisis = after.crisisResults.find(result => !before.crisisResults.some(previous => previous.month === result.month));

    if (after.phase === 'arrived' && before.phase !== 'arrived') {
      message('Callisto reached', `${getScore(after).total} arrival points · mission debrief ready`, 'arrival');
    } else if (crisis) {
      const detail = crisis.response === 'work' ? `Spent ${crisis.workSpent} Work`
        : crisis.response === 'cargo' ? `Consumed ${cardById(crisis.cargoSpent!).name}`
        : `${crisis.burdensAdded} Burdens carried forward`;
      message(CRISES.find(definition => definition.id === crisis.id)!.name, detail, 'crisis');
    } else if (after.phase === 'report' && before.phase !== 'report') {
      message(`Month ${after.month} complete`, 'Hand cleared · expedition log recorded', 'end');
    } else if (gained.length) {
      message(`${cardById(gained[0].id).name} prepared`, 'Added to discard · returns in a later draw', 'gain');
    } else if (retired.length) {
      message(`${retired.length} ${retired.length === 1 ? 'card' : 'cards'} retired`, `${retired.map(card => cardById(card.id).name).join(' · ')}${work > 0 ? ` · +${work} Work` : ''}`, 'retire');
    } else if (played.length) {
      const title = played.length === 1 ? cardById(played[0].id).name : `${played.length} Work cards played`;
      const detail = [work > 0 ? `+${work} Work` : '', drawn.length ? `Drew ${drawn.length}` : '', after.ops > before.ops ? `+${after.ops - before.ops} Ops available` : ''].filter(Boolean).join(' · ');
      message(title, detail || 'Procedure executed', played.every(card => cardById(card.id).type === 'Work') ? 'work' : 'play', played.length);
    } else if (after.month > before.month) {
      message(`Month ${after.month} · new hand`, `${after.hand.length} cards dealt${burdens.length ? ' · new obligation aboard' : ''}`, before.phase === 'briefing' ? 'launch' : 'deal', after.hand.length);
    } else if (burdens.length) {
      message(`${burdens.length} ${burdens.length === 1 ? 'Burden' : 'Burdens'} carried forward`, cardById(burdens[0].id).name, 'burden');
    } else if (before.pending?.kind === 'discard' && before.pending.redraw && !after.pending) {
      message('Hand refreshed', after.log.at(-1)?.text ?? 'Discarded cards can return after a shuffle', 'deal');
    } else if (discarded.length) {
      message('Cards moved to discard', after.phase === 'report' || after.phase === 'arrived' ? 'The month is complete' : 'Available again after a shuffle', 'discard');
    } else if (work > 0) {
      message(`+${work} Work`, 'Available for this month’s repairs and preparations', 'work');
    }

    // Reflow surviving cards smoothly; new cards arrive only when actually drawn.
    after.hand.forEach((card, index) => {
      const element = app.querySelector<HTMLElement>(`[data-card="${card.uid}"]`);
      if (!element) return;
      if (!beforeHand.has(card.uid)) {
        if (!motion.matches) {
          element.classList.add('dealing-card');
          deals.set(element, Math.min(index, 7) * 35);
          dealObserver.observe(element);
        }
      } else {
        const old = views.get(String(card.uid))?.rect;
        const current = element.getBoundingClientRect();
        if (old && visible(old) && visible(current)) animate(element, [{ transform: `translate(${old.left - current.left}px, ${old.top - current.top}px)` }, { transform: 'none' }], 260);
      }
    });
    played.forEach((card, index) => {
      const destination = app.querySelector<HTMLElement>(`[data-played-card="${card.uid}"]`);
      flight(views.get(String(card.uid)), destination, false, Math.min(index, 5) * 30);
      if (destination) animate(destination, [{ opacity: 0.3, borderColor: '#d3b275' }, { opacity: 1, borderColor: '#304458' }], 460);
    });
    retired.forEach((card, index) => flight(views.get(String(card.uid)), null, true, index * 35));
    gained.forEach(card => flight(views.get(`supply:${card.id}`), app.querySelector<HTMLElement>('[data-zone="discard"]')));
    if (after.phase !== 'report' && after.phase !== 'arrived') discarded.forEach((card, index) => flight(views.get(String(card.uid)), app.querySelector<HTMLElement>('[data-zone="discard"]'), false, index * 25));
    if (work > 0) {
      const counter = app.querySelector<HTMLElement>('[data-counter="work"]');
      if (counter) {
        counter.classList.add('work-gained');
        const gain = document.createElement('b');
        gain.className = 'work-gain';
        gain.textContent = `+${work} Work`;
        counter.append(gain);
        animate(counter, [{ background: '#3c3423' }, { background: '#101c2b' }], 650);
      }
    }
    return notice.childElementCount > 0;
  }

  return { capture, show, clear };
}

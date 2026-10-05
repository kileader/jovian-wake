import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadPressTracker, logoOpacity, SPLASH_MS } from '../studio/splash.ts';

test('studio fades follow the exact sine curve and hold for 1.5 seconds', () => {
  assert.equal(SPLASH_MS, 2400);
  for (const [time, opacity] of [[0, 0], [225, 0.5], [450, 1], [1949, 1], [1950, 1], [2175, 0.5], [2400, 0]]) {
    assert.ok(Math.abs(logoOpacity(time) - opacity) < 1e-12);
  }
  assert.equal(logoOpacity(-10), 0);
  assert.equal(logoOpacity(4000), 0);
});

test('gamepads ignore held buttons and axes, and copy mutable browser snapshots', () => {
  const pad = { index: 0, id: 'controller', buttons: [{ pressed: true }, { pressed: false }], axes: [0, 0] };
  const tracker = new GamepadPressTracker([null, pad]);
  pad.axes = [0.8, -0.6];
  assert.equal(tracker.poll([pad]), null);
  pad.buttons[0].pressed = false;
  assert.equal(tracker.poll([pad]), null);
  pad.buttons[0].pressed = true;
  assert.deepEqual(tracker.poll([pad]), { index: 0, id: 'controller', button: 0 });
  assert.equal(tracker.poll([pad]), null);
  pad.buttons[1].pressed = true;
  assert.deepEqual(tracker.poll([pad]), { index: 0, id: 'controller', button: 1 });
});

test('fresh buttons on newly detected controllers count, including index reuse', () => {
  const tracker = new GamepadPressTracker([]);
  const pad = { index: 1, id: 'first', buttons: [{ pressed: true }] };
  assert.deepEqual(tracker.poll([pad]), { index: 1, id: 'first', button: 0 });
  tracker.poll([]);
  assert.deepEqual(tracker.poll([{ ...pad, id: 'replacement' }]), { index: 1, id: 'replacement', button: 0 });
});

let moduleId = 0;

// Drive the real component with controlled frames and DOM events, without sleeps.
async function browserHarness(t: { after: (fn: () => void) => void }) {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const install = (name: string, value: unknown) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  let now = 0;
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const target = new EventTarget();
  const elements: ElementStub[] = [];
  const root: ElementStub[] = [];
  let pads: unknown[] = [];
  let decode!: () => void;
  let rejectDecode!: (error: Error) => void;
  const decoded = new Promise<void>((resolve, reject) => { decode = resolve; rejectDecode = reject; });
  class ElementStub {
    id = '';
    style = { opacity: '' };
    children: ElementStub[] = [];
    append(child: ElementStub) { this.children.push(child); }
    setAttribute() {}
    remove() { root.splice(root.indexOf(this), 1); }
    decode() { return decoded; }
  }
  install('window', target);
  install('document', {
    createElement: () => { const element = new ElementStub(); elements.push(element); return element; },
    body: { append: (element: ElementStub) => root.push(element) },
  });
  install('navigator', { getGamepads: () => pads });
  install('performance', { now: () => now });
  install('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  install('cancelAnimationFrame', (id: number) => frames.delete(id));
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const module = await import(`../studio/splash.ts?case=${++moduleId}`);
  const step = async (time: number) => {
    now = time;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(time));
    await Promise.resolve();
  };
  const send = (type: string, values: Record<string, unknown> = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), values);
    target.dispatchEvent(event);
    return event;
  };
  return { module, target, root, elements, decode, rejectDecode, step, send, setPads: (value: unknown[]) => { pads = value; } };
}

test('normal startup waits for the logo, completes once, and releases input listeners', async t => {
  const h = await browserHarness(t);
  const first = h.module.showStudioSplash();
  assert.equal(h.module.showStudioSplash(), first);
  let entered = false;
  void first.then(() => { entered = true; });
  await h.step(3000);
  assert.equal(entered, false, 'Loading time must not shorten playback');
  h.decode();
  await Promise.resolve();
  await h.step(3225);
  assert.ok(Math.abs(Number(h.elements[1].style.opacity) - 0.5) < 1e-12);
  await h.step(5400);
  await h.step(5416);
  assert.equal(entered, false, 'Handoff must include a complete neutral frame');
  await h.step(5432);
  assert.equal(entered, true);
  assert.equal(h.root.length, 0);
  assert.equal(h.send('keydown', { repeat: false, code: 'Enter' }).defaultPrevented, false);
  assert.equal(h.module.showStudioSplash(), first, 'A game reset cannot replay the studio sequence');
  assert.equal(h.root.length, 0);
});

test('held-key repeats do not skip; a fresh press and its release are consumed', async t => {
  const h = await browserHarness(t);
  let entered = false;
  void h.module.showStudioSplash().then(() => { entered = true; });
  assert.equal(h.send('keydown', { repeat: true, code: 'Space' }).defaultPrevented, true);
  await h.step(100);
  await h.step(116);
  assert.equal(entered, false);
  assert.equal(h.send('keydown', { repeat: false, code: 'Enter' }).defaultPrevented, true);
  await h.step(132);
  assert.equal(entered, false, 'Do not hand a held skipping key to the destination');
  assert.equal(h.send('keydown', { repeat: true, code: 'Enter' }).defaultPrevented, true);
  assert.equal(h.send('keyup', { code: 'Enter' }).defaultPrevented, true);
  assert.equal(h.send('keypress').defaultPrevented, true);
  await h.step(148);
  await h.step(164);
  assert.equal(entered, true);
  h.decode();
  await Promise.resolve();
  await h.step(180);
  assert.equal(h.root.length, 0, 'Late image decoding cannot restart a skipped splash');
});

test('mouse skip consumes the whole click and cannot activate a destination control', async t => {
  const h = await browserHarness(t);
  let entered = false;
  let clicks = 0;
  void h.module.showStudioSplash().then(() => { entered = true; });
  h.target.addEventListener('click', () => { clicks++; });
  assert.equal(h.send('mousedown', { button: 0 }).defaultPrevented, true);
  await h.step(16);
  assert.equal(entered, false);
  assert.equal(h.send('mouseup', { button: 0 }).defaultPrevented, true);
  assert.equal(h.send('click', { button: 0 }).defaultPrevented, true);
  assert.equal(clicks, 0);
  await h.step(32);
  await h.step(48);
  assert.equal(entered, true);
  h.send('click', { button: 0 });
  assert.equal(clicks, 1, 'Only a later, fresh click reaches the destination');
});

test('gamepad skip waits for release, and disconnection also permits handoff', async t => {
  const h = await browserHarness(t);
  const pad = { index: 0, id: 'pad', buttons: [{ pressed: true }] };
  h.setPads([pad]);
  let entered = false;
  void h.module.showStudioSplash().then(() => { entered = true; });
  await h.step(16);
  assert.equal(entered, false, 'A button held at startup must not skip');
  pad.buttons[0].pressed = false;
  await h.step(32);
  pad.buttons[0].pressed = true;
  await h.step(48);
  await h.step(64);
  assert.equal(entered, false, 'The skipping gamepad button is still held');
  h.setPads([]);
  await h.step(80);
  await h.step(96);
  assert.equal(entered, true);
});

test('releasing a fresh gamepad press hands off without carrying the button into the game', async t => {
  const h = await browserHarness(t);
  const pad = { index: 0, id: 'pad', buttons: [{ pressed: false }] };
  h.setPads([pad]);
  let entered = false;
  void h.module.showStudioSplash().then(() => { entered = true; });
  pad.buttons[0].pressed = true;
  await h.step(16);
  assert.equal(entered, false);
  pad.buttons[0].pressed = false;
  await h.step(32);
  assert.equal(entered, false);
  await h.step(48);
  assert.equal(entered, true);
  assert.equal(pad.buttons[0].pressed, false);
});

test('focus loss releases a skipped key so startup cannot get stuck', async t => {
  const h = await browserHarness(t);
  let entered = false;
  void h.module.showStudioSplash().then(() => { entered = true; });
  h.send('keydown', { repeat: false, code: 'Space' });
  h.send('blur');
  await h.step(16);
  await h.step(32);
  assert.equal(entered, true);
});

test('a failed logo load keeps startup able to enter the game', async t => {
  const h = await browserHarness(t);
  const originalError = console.error;
  const errors: unknown[] = [];
  console.error = (...values: unknown[]) => { errors.push(values); };
  t.after(() => { console.error = originalError; });
  let entered = false;
  void h.module.showStudioSplash().then(() => { entered = true; });
  h.rejectDecode(new Error('Missing logo'));
  await Promise.resolve();
  await Promise.resolve();
  await h.step(16);
  await h.step(32);
  assert.equal(entered, true);
  assert.equal(h.root.length, 0);
  assert.equal(errors.length, 1);
});

import { showStudioSplash } from '../studio/splash.ts';
import '../studio/splash.css';

async function openGame(): Promise<void> {
  await showStudioSplash();
  if (new URLSearchParams(location.search).get('mode') === 'engineering') {
    const { mountEngineering } = await import('./engineering-view.ts');
    mountEngineering();
  } else {
    await import('./main.ts');
  }
  // Reveal only after the destination and its styles are ready, with black beneath.
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  document.documentElement.removeAttribute('data-startup');
}

void openGame().catch(error => {
  console.error('Unable to open Jovian Wake.', error);
  const message = document.createElement('p');
  message.textContent = 'Unable to open the game. Reload this page to try again.';
  message.style.cssText = 'color: white; padding: 2rem; font-family: sans-serif;';
  message.setAttribute('role', 'alert');
  document.body.append(message);
});

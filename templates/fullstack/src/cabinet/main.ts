import { component, register } from 'riot';
import { screens } from './router';
import { applyStoredTheme, watchSystemTheme } from './theme';
import './styles/reset.css';
import './styles/theme.css';
import './styles/ripple.css';
import './styles/app.css';
import './styles/components/topbar.css';
import './styles/components/drawer.css';
import './styles/components/groups.css';
import './styles/components/spinner.css';
import './styles/components/screens.css';
import './styles/interaction.css';
import App from './components/app.riot';
import Drawer from './components/drawer.riot';
import Icon from './components/icon.riot';
import Spinner from './components/spinner.riot';
import Topbar from './components/topbar.riot';

applyStoredTheme();
watchSystemTheme();

// iOS Safari skips :active unless the document has a touch listener.
document.addEventListener('touchstart', () => {}, { passive: true });

register('topbar', Topbar);
register('drawer', Drawer);
register('icon', Icon);
register('spinner', Spinner);
for (const screen of screens) register(screen.name, screen.component);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Mount point #root is missing');
}

component(App)(root, {});

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => registration.unregister()),
  );
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith('shell-'))
      .map((key) => caches.delete(key)),
  );
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  const prompt = () => {
    if (!registration.waiting) return;
    if (!navigator.serviceWorker.controller) {
      registration.waiting.postMessage({ type: 'skip-waiting' });
      return;
    }
    if (document.querySelector('[data-update]')) return;
    const button = document.createElement('button');
    button.dataset.update = 'true';
    button.type = 'button';
    button.textContent = 'A new version is ready. Reload';
    button.addEventListener('click', () => {
      registration.waiting?.postMessage({ type: 'skip-waiting' });
    });
    document.body.prepend(button);
  };
  if (registration.waiting) prompt();
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', prompt);
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

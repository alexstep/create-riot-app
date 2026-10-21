import '../styles/landing.css';
import { applyStoredTheme, watchSystemTheme } from '../cabinet/theme';
import { hydrate, readHydrationState } from '../client/hydrate';
import LoginForm from './login-form.riot';
import SubscribeForm from './subscribe-form.riot';
import ThemeToggle from './theme-toggle.riot';

applyStoredTheme();
watchSystemTheme();

// Props in #riot-state are the server render. Do not fetch them again here.
const state = readHydrationState();

const theme = document.querySelector('theme-toggle');
if (theme instanceof HTMLElement) {
  hydrate(ThemeToggle)(theme, {});
}

const subscribe = document.querySelector('subscribe-form');
if (subscribe instanceof HTMLElement) {
  const props = state['subscribe-form'];
  hydrate(SubscribeForm)(subscribe, {
    hint: '',
    ...(props && typeof props === 'object' ? props : {}),
  });
}

const login = document.querySelector('login-form');
if (login instanceof HTMLElement) {
  hydrate(LoginForm)(login, {});
}

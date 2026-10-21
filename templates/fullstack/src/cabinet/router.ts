import { initDomListeners, router, setBase } from '@riotjs/route';
import type { RiotComponent, RiotComponentWrapper } from 'riot';
import Dashboard from './components/screens/dashboard.riot';
import Groups from './components/screens/groups.riot';
import Records from './components/screens/records.riot';
import Settings from './components/screens/settings.riot';

export interface AppScreen {
  name: 'dashboard' | 'groups' | 'settings' | 'records';
  label: string;
  icon: string;
  href: string;
  component: RiotComponentWrapper<RiotComponent>;
}

export const screens: readonly AppScreen[] = [
  {
    name: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard.svg',
    href: '/app/dashboard',
    component: Dashboard,
  },
  {
    name: 'groups',
    label: 'List',
    icon: 'group.svg',
    href: '/app/groups',
    component: Groups,
  },
  {
    name: 'settings',
    label: 'Settings',
    icon: 'settings.svg',
    href: '/app/settings',
    component: Settings,
  },
  {
    name: 'records',
    label: 'Records',
    icon: 'settings.svg',
    href: '/app/records',
    component: Records,
  },
];

export type Screen = AppScreen['name'];

const names: readonly string[] = screens.map((screen) => screen.name);

export function parseScreen(path: string): Screen {
  const withoutOrigin = path.replace(/^[a-z]+:\/\/[^/]+/i, '');
  const hashed = withoutOrigin.includes('#')
    ? withoutOrigin.slice(withoutOrigin.indexOf('#') + 1)
    : withoutOrigin;
  let rest = hashed.replace(/^\/+/, '');
  if (rest === 'app') rest = '';
  else if (rest.startsWith('app/')) rest = rest.slice(4);
  const name = rest.split(/[/?#]/)[0] ?? '';
  return (names.includes(name) ? name : 'dashboard') as Screen;
}

export function navigate(path: string): void {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  router.push(normalized);
}

export function startRouter(onScreen: (screen: Screen) => void): () => void {
  setBase('/app');
  const listen = initDomListeners as unknown as () => () => void;
  const stopDom = listen();

  const onValue = (path: string) => {
    onScreen(parseScreen(String(path)));
  };

  router.on.value(onValue);
  router.push(window.location.href);

  return () => {
    router.off.value(onValue);
    stopDom();
  };
}

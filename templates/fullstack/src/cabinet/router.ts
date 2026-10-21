import { initDomListeners, router, setBase } from '@riotjs/route';
import type { RiotComponent, RiotComponentWrapper } from 'riot';
import Dashboard from './components/screens/dashboard.riot';
import Groups from './components/screens/groups.riot';
import Records from './components/screens/records.riot';
import Settings from './components/screens/settings.riot';
import {
  type CabinetScreen,
  cabinetReturnPath,
  normalizeCabinetPath,
} from './paths';

export interface AppScreen {
  name: CabinetScreen;
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
    label: 'Groups',
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
  const name = normalizeCabinetPath(path).slice('/app/'.length);
  return (names.includes(name) ? name : 'dashboard') as Screen;
}

/**
 * `@riotjs/route` setBase('/app') stores `origin + /app`.
 * `router.push` prefixes that base again unless the argument already
 * contains it. Pass the absolute cabinet URL, never a second `/app`.
 */
export function navigate(path: string): void {
  const canonical = cabinetReturnPath(path);
  router.push(new URL(canonical, window.location.origin).href);
}

export function startRouter(onScreen: (screen: Screen) => void): () => void {
  setBase('/app');
  const listen = initDomListeners as unknown as () => () => void;
  const stopDom = listen();

  const onValue = (path: string) => {
    onScreen(parseScreen(String(path)));
  };

  router.on.value(onValue);
  const canonical = normalizeCabinetPath(window.location.pathname);
  if (canonical !== window.location.pathname) {
    window.history.replaceState(null, '', canonical);
  }
  router.push(window.location.href);

  return () => {
    router.off.value(onValue);
    stopDom();
  };
}

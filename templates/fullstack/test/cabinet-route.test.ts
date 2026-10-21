import { afterEach, describe, expect, test } from 'bun:test';
import { setBase } from '@riotjs/route';
import { cabinetReturnPath, normalizeCabinetPath } from '../src/cabinet/paths';
import {
  navigate,
  parseScreen,
  screens,
  startRouter,
} from '../src/cabinet/router';

describe('cabinet paths', () => {
  test('every screen href is a single /app prefix', () => {
    expect(screens.map((screen) => screen.href)).toEqual([
      '/app/dashboard',
      '/app/groups',
      '/app/settings',
      '/app/records',
    ]);
    for (const screen of screens) {
      expect(screen.href).toBe(`/app/${screen.name}`);
      expect(screen.href.includes('/app/app')).toBe(false);
    }
  });

  test('a doubled prefix collapses and unknown paths become the dashboard', () => {
    expect(normalizeCabinetPath('/app/groups')).toBe('/app/groups');
    expect(normalizeCabinetPath('/app/app/groups')).toBe('/app/groups');
    expect(normalizeCabinetPath('/app/app/app/records')).toBe('/app/records');
    expect(normalizeCabinetPath('http://localhost:3000/app/app/groups')).toBe(
      '/app/groups',
    );
    expect(normalizeCabinetPath('/app')).toBe('/app/dashboard');
    expect(normalizeCabinetPath('/app/nope')).toBe('/app/dashboard');
    expect(normalizeCabinetPath('/groups')).toBe('/app/groups');
    expect(cabinetReturnPath('https://evil.example/app/groups')).toBe(
      '/app/dashboard',
    );
    expect(cabinetReturnPath('//evil.example/app/groups')).toBe(
      '/app/dashboard',
    );
    expect(parseScreen('/app/app/groups')).toBe('groups');
    expect(parseScreen('http://localhost:3000/app/groups')).toBe('groups');
    expect(parseScreen('/app/app/groups')).not.toBe('dashboard');
  });
});

type LocationState = {
  protocol: string;
  host: string;
  origin: string;
  href: string;
  pathname: string;
};

function installWindow(pathname: string): LocationState {
  const location: LocationState = {
    protocol: 'http:',
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    href: `http://localhost:3000${pathname}`,
    pathname,
  };
  const apply = (url: string) => {
    const next = new URL(url, location.origin);
    location.href = next.href;
    location.pathname = next.pathname;
  };
  const history = {
    pushState(_state: unknown, _title: unknown, url?: string | URL | null) {
      if (url != null) apply(String(url));
    },
    replaceState(_state: unknown, _title: unknown, url?: string | URL | null) {
      if (url != null) apply(String(url));
    },
  };
  const documentStub = {
    title: 'Cabinet',
    addEventListener() {},
    removeEventListener() {},
  };
  const windowStub = {
    location,
    document: documentStub,
    history,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = windowStub as unknown as Window & typeof globalThis;
  globalThis.document = documentStub as unknown as Document;
  globalThis.history = history as unknown as History;
  globalThis.location = location as unknown as Location;
  return location;
}

describe('router does not prefix /app twice', () => {
  let stop = () => {};

  afterEach(() => {
    stop();
    stop = () => {};
    setBase('https://localhost');
  });

  test('drawer navigation and a doubled deep link stay on /app/<screen>', async () => {
    const location = installWindow('/app/dashboard');
    stop = startRouter(() => {});
    navigate('/app/groups');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(location.pathname).toBe('/app/groups');
    expect(location.href).toBe('http://localhost:3000/app/groups');
    expect(location.href.includes('/app/app')).toBe(false);

    stop();
    const doubled = installWindow('/app/app/groups');
    let seen = '';
    stop = startRouter((screen) => {
      seen = screen;
    });
    expect(doubled.pathname).toBe('/app/groups');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(doubled.href.includes('/app/app')).toBe(false);
    expect(seen).toBe('groups');
  });
});

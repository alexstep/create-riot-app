import { afterEach, describe, expect, test } from 'bun:test';
import hydrateOfficial from '@riotjs/hydrate';
import { parseHTML } from 'linkedom';
import { hydrate } from '../src/client/hydrate';
import SubscribeForm from '../src/islands/subscribe-form.riot';
import ThemeToggle from '../src/islands/theme-toggle.riot';
import { createApp } from '../src/server/app';
import { parseEnv } from '../src/server/env';
import { safeJson } from '../src/server/html';

const env = parseEnv({
  SESSION_SECRET: 'test-session-secret-value',
  DEMO_PASSWORD: 'demo',
  NODE_ENV: 'test',
  PORT: '3000',
});
const app = createApp(env);

const hint = 'Send a note. It stays in memory on this server.';

type Globals = {
  window: typeof globalThis.window;
  document: typeof globalThis.document;
  Node: typeof globalThis.Node;
  NodeFilter: unknown;
};

function readGlobals(): Globals {
  return {
    window: globalThis.window,
    document: globalThis.document,
    Node: globalThis.Node,
    NodeFilter: (globalThis as { NodeFilter?: unknown }).NodeFilter,
  };
}

function restore(previous: Globals): void {
  globalThis.window = previous.window;
  globalThis.document = previous.document;
  globalThis.Node = previous.Node;
  (globalThis as { NodeFilter?: unknown }).NodeFilter = previous.NodeFilter;
}

function useDocument(html: string): ReturnType<typeof parseHTML> {
  const dom = parseHTML(html);
  const filter = (dom as { NodeFilter?: unknown }).NodeFilter ?? {
    SHOW_ELEMENT: 1,
    FILTER_ACCEPT: 1,
  };
  globalThis.window = dom;
  globalThis.document = dom.document;
  globalThis.Node = dom.Node;
  (globalThis as { NodeFilter?: unknown }).NodeFilter = filter;
  return dom;
}

let previous: Globals | null = null;

afterEach(() => {
  if (!previous) return;
  restore(previous);
  previous = null;
});

describe('safe JSON', () => {
  test('a closing script tag cannot break out of the payload', () => {
    const nasty = '</script><script>alert(1)</script>&\'"\u2028';
    const encoded = safeJson({ hint: nasty });
    expect(encoded).not.toContain('<');
    expect(encoded).not.toContain('>');
    expect(encoded).not.toContain('&');
    expect(encoded).not.toContain('\u2028');
    expect(JSON.parse(encoded)).toEqual({ hint: nasty });
  });
});

describe('hydration', () => {
  test('the client binds the server nodes and does not replace them', async () => {
    const html = await (await app.request('http://localhost/')).text();
    expect(html).toContain(`<p class="hint">${hint}</p>`);
    previous = readGlobals();
    useDocument(html);

    const root = document.querySelector('subscribe-form');
    const form = document.querySelector('subscribe-form form');
    const email = document.querySelector('subscribe-form input[name="email"]');
    const message = document.querySelector(
      'subscribe-form input[name="message"]',
    );
    const button = document.querySelector('theme-toggle button');
    expect(root).toBeTruthy();
    expect(form).toBeTruthy();
    expect(email).toBeTruthy();
    expect(message).toBeTruthy();
    expect(button).toBeTruthy();
    if (!root || !form || email?.tagName !== 'INPUT' || !message || !button)
      return;
    const input = email as HTMLInputElement;
    input.value = 'typed@example.com';

    const listened: string[] = [];
    const original = form.addEventListener;
    form.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      listened.push(type);
      return original.call(form, type, listener, options);
    }) as typeof form.addEventListener;

    let fetches = 0;
    const fetchImpl = globalThis.fetch;
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      fetches += 1;
      return fetchImpl(...args);
    }) as typeof fetch;

    try {
      const subscribe = hydrate(SubscribeForm)(root as HTMLElement, { hint });
      hydrate(ThemeToggle)(button.parentElement as HTMLElement, {});

      expect(document.querySelector('subscribe-form')).toBe(root);
      expect(document.querySelector('subscribe-form form')).toBe(form);
      expect(document.querySelector('subscribe-form input[name="email"]')).toBe(
        input,
      );
      expect(
        document.querySelector('subscribe-form input[name="message"]'),
      ).toBe(message);
      expect(document.querySelectorAll('subscribe-form form')).toHaveLength(1);
      expect(input.value).toBe('typed@example.com');
      expect(document.querySelector('theme-toggle button')).toBe(button);
      expect(listened).toContain('submit');
      expect(fetches).toBe(0);
      expect(root.textContent).toContain(hint);

      subscribe.update({ note: 'Sent.' });
      expect(document.querySelector('subscribe-form input[name="email"]')).toBe(
        input,
      );
      expect(root.textContent).toContain('Sent.');
      expect(root.textContent).toContain(hint);
    } finally {
      globalThis.fetch = fetchImpl;
    }
  });

  test('official @riotjs/hydrate replaces the server root', async () => {
    const html = await (await app.request('http://localhost/')).text();
    previous = readGlobals();
    useDocument(html);
    const root = document.querySelector('subscribe-form');
    const email = document.querySelector('subscribe-form input[name="email"]');
    expect(root?.parentElement).toBeTruthy();
    if (!root || !email) return;
    const instance = hydrateOfficial(SubscribeForm)(root as HTMLElement, {
      hint,
    });
    expect(instance.root).not.toBe(root);
    expect(instance.root.contains(email)).toBe(false);
    expect(root.isConnected).toBe(false);
  });
});

import {
  type BrowserContext,
  chromium,
  type Page,
} from '/workspace/visual/node_modules/playwright/index.mjs';

const base = process.env.CHECK_URL ?? 'http://127.0.0.1:3010';
const failures: string[] = [];

function watch(page: Page): void {
  page.on('pageerror', (error) => {
    failures.push(error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Uncaught|TypeError|Failed to fetch/i.test(text)) failures.push(text);
  });
}

async function login(page: Page, email: string): Promise<void> {
  watch(page);
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('demo');
  await page
    .locator('login-form')
    .getByRole('button', { name: 'Log in' })
    .click();
  for (let i = 0; i < 40 && !page.url().includes('/app/'); i++) {
    await page.waitForTimeout(250);
  }
  await page.goto(`${base}/app/records`, { waitUntil: 'domcontentloaded' });
  await page.locator('.transport').waitFor({ timeout: 15000 });
}

async function twoTabs(
  context: BrowserContext,
  email: string,
  transport: string,
): Promise<[Page, Page]> {
  const first = await context.newPage();
  await login(first, email);
  const second = await context.newPage();
  await login(second, email);
  await first.locator('.transport', { hasText: transport }).waitFor();
  await second.locator('.transport', { hasText: transport }).waitFor();
  const name = email.split('@')[0] ?? email;
  await first.locator('input[name="name"]').fill(name);
  await first.locator('input[name="email"]').fill(email);
  await first.locator('textarea[name="message"]').fill(`from ${transport}`);
  await first.getByRole('button', { name: 'Save' }).click();
  await second
    .locator('input[name="name"]')
    .filter({ hasValue: name })
    .waitFor();
  return [first, second];
}

async function saveLooksDisabled(page: Page): Promise<void> {
  const save = page.getByRole('button', { name: 'Save' });
  if (!(await save.isDisabled())) throw new Error('Save stayed enabled');
  const opacity = await save.evaluate((el) => getComputedStyle(el).opacity);
  if (Number(opacity) > 0.6) {
    throw new Error(`Save did not look disabled (opacity ${opacity})`);
  }
}

const browser = await chromium.launch({ headless: true });
const shared = await browser.newContext({
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.10' },
});
const [alice, aliceAgain] = await twoTabs(
  shared,
  'alice@example.com',
  'shared-worker',
);
const drawer =
  (await alice.locator('a[href="/app/records"]').textContent()) ?? '';
if (!drawer.includes('Records')) {
  throw new Error(`Drawer label was ${JSON.stringify(drawer)}`);
}
await alice.getByRole('heading', { name: 'Records', exact: true }).waitFor();

await shared.setOffline(true);
await alice.reload({ waitUntil: 'domcontentloaded' });
await alice.locator('.banner', { hasText: 'You are offline' }).waitFor();
await alice.locator('.banner', { hasText: 'may be stale' }).waitFor();
await saveLooksDisabled(alice);

await shared.setOffline(false);
await alice.reload({ waitUntil: 'domcontentloaded' });
await alice.locator('.transport', { hasText: 'shared-worker' }).waitFor();
await alice.locator('.banner').waitFor({ state: 'hidden', timeout: 15000 });
const save = alice.getByRole('button', { name: 'Save' });
if (await save.isDisabled())
  throw new Error('Save stayed disabled after reconnect');

await shared.clearCookies();
await alice.locator('input[name="name"]').fill('alice');
await save.click();
await alice.waitForURL(/\/login\?next=/);
await aliceAgain.waitForURL(/\/login\?next=/);
for (const page of [alice, aliceAgain]) {
  const next = new URL(page.url()).searchParams.get('next') ?? '';
  if (!next.startsWith('/app/records')) {
    throw new Error(`Return path was ${page.url()}`);
  }
}
await shared.close();

const bob = await browser.newContext({
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.11' },
});
const bobPage = await bob.newPage();
await login(bobPage, 'bob@example.com');
const bobName = await bobPage.locator('input[name="name"]').inputValue();
if (bobName.toLowerCase().includes('alice')) {
  throw new Error(`Bob saw Alice's profile: ${bobName}`);
}
await bob.close();

const locked = await browser.newContext({
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.12' },
});
await locked.addInitScript(() => {
  Object.defineProperty(window, 'SharedWorker', {
    configurable: true,
    value: undefined,
  });
});
const [cara, caraAgain] = await twoTabs(locked, 'cara@example.com', 'leader');
await locked.route('**/api/**', (route) => route.abort('failed'));
await cara
  .locator('.banner', { hasText: 'unreachable' })
  .waitFor({ timeout: 15000 });
await caraAgain
  .locator('.banner', { hasText: 'unreachable' })
  .waitFor({ timeout: 15000 });
await saveLooksDisabled(cara);
await locked.unroute('**/api/**');
await cara.locator('.banner').waitFor({ state: 'hidden', timeout: 15000 });
await caraAgain.locator('.banner').waitFor({ state: 'hidden', timeout: 15000 });
await cara.close();
await locked.close();

await browser.close();
if (failures.length > 0) {
  throw new Error(`Unhandled browser errors:\n${failures.join('\n')}`);
}
console.log('browser check ok');

import {
  type BrowserContext,
  chromium,
  type Page,
} from '/workspace/visual/node_modules/playwright/index.mjs';

const base = process.env.CHECK_URL ?? 'http://127.0.0.1:3010';

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('demo');
  await page
    .locator('x-login-form')
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
): Promise<void> {
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
  await second.close();
  return first;
}

const browser = await chromium.launch({ headless: true });
const shared = await browser.newContext({
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.10' },
});
const alice = await twoTabs(shared, 'alice@example.com', 'shared-worker');
await shared.setOffline(true);
await alice.reload({ waitUntil: 'domcontentloaded' });
await alice.locator('.banner', { hasText: 'may be stale' }).waitFor();
await alice.getByRole('heading', { name: 'Data' }).waitFor();
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
await twoTabs(locked, 'cara@example.com', 'leader');
await locked.close();

await browser.close();
console.log('browser check ok');

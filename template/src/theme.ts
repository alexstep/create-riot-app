export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

let memoryChoice: ThemeChoice | null = null;
let watching = false;

function readStorage(): ThemeChoice | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system')
      return saved;
  } catch {
    // Storage can be blocked. The in-memory choice still applies.
  }
  return null;
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function getThemeChoice(): ThemeChoice {
  if (memoryChoice) return memoryChoice;
  memoryChoice = readStorage() ?? 'system';
  return memoryChoice;
}

export function resolvedTheme(): ResolvedTheme {
  const choice = getThemeChoice();
  return choice === 'system' ? systemTheme() : choice;
}

export function applyStoredTheme(): void {
  const resolved = resolvedTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue('--theme-color')
    .trim();
  if (color)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', color);
}

export function setThemeChoice(choice: ThemeChoice): void {
  memoryChoice = choice;
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Keep memoryChoice so the selection survives a blocked storage write.
  }
  applyStoredTheme();
  window.dispatchEvent(new Event('themechange'));
}

export function watchSystemTheme(): void {
  if (watching) return;
  watching = true;
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getThemeChoice() === 'system') applyStoredTheme();
    });
}

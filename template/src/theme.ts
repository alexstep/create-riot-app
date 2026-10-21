export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

export function getThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // localStorage can be blocked. Fall back to the system theme.
  }
  return 'system'
}

export function applyStoredTheme(): void {
  const choice = getThemeChoice()
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)

  const resolved = choice === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : choice
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#14171c' : '#5181b8')
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Ignore a blocked storage and still apply the choice for this visit.
  }
  applyStoredTheme()
  window.dispatchEvent(new Event('themechange'))
}

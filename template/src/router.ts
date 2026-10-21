import { initDomListeners, router, setBase } from '@riotjs/route'

export type Screen = 'dashboard' | 'groups' | 'settings'

const SCREENS: readonly Screen[] = ['dashboard', 'groups', 'settings']

export function parseScreen(path: string): Screen {
  const withoutOrigin = path.replace(/^[a-z]+:\/\/[^/]+/i, '')
  const hashed = withoutOrigin.includes('#')
    ? withoutOrigin.slice(withoutOrigin.indexOf('#') + 1)
    : withoutOrigin
  const name = hashed.replace(/^\/+/, '').split(/[/?#]/)[0] ?? ''
  return (SCREENS as readonly string[]).includes(name) ? (name as Screen) : 'dashboard'
}

export function navigate(path: string): void {
  const normalized = path.startsWith('/') ? path : `/${path}`
  router.push(normalized)
}

export function startRouter(onScreen: (screen: Screen) => void): () => void {
  setBase('/')
  const listen = initDomListeners as unknown as () => () => void
  const stopDom = listen()

  const onValue = (path: string) => {
    onScreen(parseScreen(String(path)))
  }

  router.on.value(onValue)
  router.push(window.location.href)

  return () => {
    router.off.value(onValue)
    stopDom()
  }
}

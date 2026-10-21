import { component } from 'riot'
import Cabinet from './components/cabinet.riot'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')
component(Cabinet)(root, {})

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
  const keys = await caches.keys()
  await Promise.all(keys.filter((key) => key.startsWith('shell-')).map((key) => caches.delete(key)))
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registration = await navigator.serviceWorker.register('/sw.js')
  watchUpdate(registration)
}

function watchUpdate(registration: ServiceWorkerRegistration): void {
  const prompt = () => {
    if (!registration.waiting) return
    if (!navigator.serviceWorker.controller) {
      registration.waiting.postMessage({ type: 'skip-waiting' })
      return
    }
    if (document.querySelector('[data-update]')) return
    const button = document.createElement('button')
    button.dataset.update = 'true'
    button.type = 'button'
    button.textContent = 'A new version is ready. Reload'
    button.style.margin = '12px'
    button.addEventListener('click', () => {
      registration.waiting?.postMessage({ type: 'skip-waiting' })
    })
    document.body.prepend(button)
  }
  if (registration.waiting) prompt()
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', prompt)
  })
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
}

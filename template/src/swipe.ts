export interface SwipeOptions {
  wrapper: HTMLElement
  drawer: HTMLElement
  overlay: HTMLElement
  drawerWidth: number
  handlerWidth: number
  isOpen: () => boolean
  onChange: (open: boolean) => void
}

const TAP_SLOP = 8

export function readDrawerMetrics(): { width: number; handler: number; speedMs: number } {
  const style = getComputedStyle(document.documentElement)
  const px = (name: string, fallback: number): number => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  const speed = style.getPropertyValue('--drawer-speed').trim()
  const speedMs = speed.endsWith('ms') ? Number.parseFloat(speed) : Number.parseFloat(speed) * 1000
  return {
    width: px('--drawer-width', 240),
    handler: px('--drawer-handler-width', 50),
    speedMs: Number.isFinite(speedMs) ? speedMs : 100,
  }
}

export function initSwipe(options: SwipeOptions): () => void {
  const { wrapper, drawer, overlay } = options
  let tracking = false
  let panning = false
  let pointerId = -1
  let originX = 0
  let originY = 0
  let startX = 0
  let lastX = 0
  let drawerOpen = false
  let suppressClick = false

  const width = (): number => {
    const measured = drawer.getBoundingClientRect().width
    return measured > 0 ? measured : options.drawerWidth
  }

  const release = (id: number): void => {
    if (!wrapper.hasPointerCapture(id)) return
    try {
      wrapper.releasePointerCapture(id)
    } catch {
      // The pointer may already be gone.
    }
  }

  const clearGesture = (): void => {
    wrapper.classList.remove('pan')
    drawer.style.removeProperty('transform')
    overlay.style.removeProperty('opacity')
  }

  const paint = (visible: number, total: number): void => {
    const x = Math.max(0, Math.min(total, visible))
    drawer.style.transform = `translate3d(${x - total}px,0,0)`
    overlay.style.opacity = String(total === 0 ? 0 : x / total)
    wrapper.classList.add('pan')
  }

  const finish = (): void => {
    clearGesture()
    wrapper.classList.toggle('show', drawerOpen)
    options.onChange(drawerOpen)
  }

  const onDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return
    if (tracking) return
    const open = options.isOpen()
    if (!open && event.clientX > options.handlerWidth) return
    tracking = true
    panning = false
    pointerId = event.pointerId
    originX = event.clientX
    originY = event.clientY
    lastX = event.clientX
    startX = open ? event.clientX : 0
    drawerOpen = open
  }

  const onMove = (event: PointerEvent): void => {
    if (!tracking || event.pointerId !== pointerId || event.pointerType !== 'touch') return
    const dx = event.clientX - originX
    const dy = event.clientY - originY
    if (!panning) {
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return
      if (Math.abs(dy) > Math.abs(dx)) {
        tracking = false
        return
      }
      panning = true
      try {
        wrapper.setPointerCapture(event.pointerId)
      } catch {
        // Window listeners still follow the finger.
      }
    }

    event.preventDefault()
    const total = width()
    let visible = event.clientX
    if (startX) visible += total - startX
    const direction = event.clientX >= lastX ? 'right' : 'left'
    lastX = event.clientX
    const ratio = direction === 'right' ? 0.3 : 0.7
    const clamped = Math.max(0, Math.min(total, visible))
    drawerOpen = clamped >= total * ratio
    paint(clamped, total)
  }

  const endGesture = (event: PointerEvent, cancel: boolean): void => {
    if (!tracking || event.pointerId !== pointerId) return
    release(event.pointerId)
    tracking = false
    const wasPanning = panning
    panning = false
    if (!wasPanning) return
    if (cancel) {
      clearGesture()
      return
    }
    suppressClick = true
    finish()
  }

  const onUp = (event: PointerEvent): void => {
    endGesture(event, false)
  }

  const onCancel = (event: PointerEvent): void => {
    endGesture(event, true)
  }

  const onClickCapture = (event: Event): void => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  wrapper.addEventListener('pointerdown', onDown)
  wrapper.addEventListener('click', onClickCapture, true)
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)

  return () => {
    wrapper.removeEventListener('pointerdown', onDown)
    wrapper.removeEventListener('click', onClickCapture, true)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
  }
}

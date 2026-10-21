let generation = 0;
let cleanup: (() => void) | null = null;

export function syncTopbarScroll(): void {
  const token = ++generation;
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  document.body.classList.remove('scroll');

  window.setTimeout(() => {
    if (token !== generation) return;
    const screen = document.querySelector<HTMLElement>(
      '.screen[data-topbar="scroll"]',
    );
    if (!screen || window.innerWidth > 800) {
      if (screen) screen.style.height = '';
      return;
    }

    const topbar = document.getElementById('topbar');
    const height = topbar?.offsetHeight ?? 58;
    screen.style.height = `calc(100vh + ${height}px)`;
    document.body.classList.add('scroll');

    let prev = screen.scrollTop;
    const onScroll = (event: Event): void => {
      const st = window.scrollY;
      const delta = screen.scrollTop - prev;
      if ((delta > 0 && st < height) || delta < 0) {
        if (st > 0) screen.scrollTop = prev;
        window.scrollTo(0, Math.max(0, st + delta));
        event.preventDefault();
      }
      prev = screen.scrollTop;
    };

    screen.addEventListener('scroll', onScroll, { passive: false });
    cleanup = () => {
      screen.removeEventListener('scroll', onScroll);
      screen.style.height = '';
      document.body.classList.remove('scroll');
    };
  }, 500);
}

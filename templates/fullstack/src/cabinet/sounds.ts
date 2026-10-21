export interface SoundBoard {
  play(name: string, volume?: number): void;
  tick(volume?: number): void;
  hover(volume?: number): void;
  card(volume?: number): void;
}

const preferOgg = (): boolean => {
  if (typeof Audio === 'undefined') return true;
  return new Audio().canPlayType('audio/ogg') !== '';
};

export function createSounds(soundsPath = '/sounds/'): SoundBoard {
  const ext = preferOgg() ? 'ogg' : 'mp3';
  const cache = new Map<string, HTMLAudioElement>();

  const file = (name: string): HTMLAudioElement => {
    const cached = cache.get(name);
    if (cached) return cached;
    const audio = new Audio(`${soundsPath}${name}.${ext}`);
    audio.preload = 'auto';
    cache.set(name, audio);
    return audio;
  };

  const play = (name: string, volume = 0.3, offset = 0): void => {
    const audio = file(name);
    audio.volume = volume;
    audio.pause();
    try {
      audio.currentTime = offset;
    } catch {
      // The browser has not loaded metadata yet. play() still starts at 0.
    }
    void audio.play().catch(() => {
      // Autoplay can reject before the first gesture. The next click retries.
    });
  };

  return {
    play: (name, volume) => play(name, volume),
    tick: (volume = 0.1) => play('tick', volume, 0.02),
    hover: (volume = 0.12) => play('hover', volume),
    card: (volume = 0.35) => play('card', volume),
  };
}

export const sound = createSounds();

export function playHover(event: PointerEvent): void {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  sound.hover();
}

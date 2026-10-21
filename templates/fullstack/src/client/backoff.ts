/** Exponential backoff with jitter. There is no attempt cap: the hub keeps trying. */
export function nextDelay(attempt: number, rand = Math.random()): number {
  const step = Math.max(0, attempt);
  const base = Math.min(500 * 2 ** step, 10_000);
  return Math.round(base * (0.5 + rand * 0.5));
}

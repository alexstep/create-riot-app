import { finish } from './wire';

export async function connectHub(origin: string) {
  if (typeof SharedWorker !== 'undefined') {
    const worker = new SharedWorker(
      new URL('./hub.worker.ts', import.meta.url),
      {
        type: 'module',
        name: 'riot-hub',
      },
    );
    return finish(worker.port);
  }
  if (
    typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof BroadcastChannel !== 'undefined'
  ) {
    const { connectLeader } = await import('./leader');
    return connectLeader(origin);
  }
  const { connectSolo } = await import('./solo');
  return connectSolo(origin);
}

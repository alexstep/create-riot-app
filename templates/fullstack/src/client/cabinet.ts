import type { FileMeta, Profile } from '../contract/schemas';
import {
  type Client,
  createClient,
  downloadUrl,
  type FieldError,
  submitProfile,
  uploadFiles,
} from './api';
import type { Connection } from './caller';
import { connectHub } from './connect';
import type { LogLine, Snapshot } from './protocol';

export type Cabinet = {
  client: Client;
  connection: Connection;
  subscribe: (listener: (view: CabinetView) => void) => () => void;
  save: (input: {
    name: string;
    email: string;
    message: string;
  }) => Promise<FieldError | null>;
  upload: (
    files: File[],
    onProgress: (progress: { loaded: number; total: number }) => void,
  ) => Promise<string | null>;
  download: (id: string) => string;
};

export type CabinetView = {
  transport: string;
  online: boolean;
  storedAt: number | null;
  profile: Profile | null;
  files: FileMeta[];
  log: LogLine[];
  sessionLost: boolean;
};

export async function startCabinet(origin = location.origin): Promise<Cabinet> {
  const connection = await connectHub(origin);
  const client = createClient(origin, connection.fetch);
  let sessionLost = false;
  connection.onSessionLost(() => {
    sessionLost = true;
  });
  return {
    client,
    connection,
    subscribe(listener) {
      const send = (state: Snapshot) => listener(toView(state, sessionLost));
      return connection.subscribe(send);
    },
    async save(input) {
      const result = await submitProfile(client, input);
      if (!result.ok) return { error: result.error, fields: result.fields };
      return null;
    },
    async upload(files, onProgress) {
      const result = await uploadFiles(connection, client, files, onProgress);
      if (!result.ok) return result.error;
      return null;
    },
    download(id) {
      return downloadUrl(client, id);
    },
  };
}

function toView(state: Snapshot, sessionLost: boolean): CabinetView {
  return {
    transport: state.transport,
    online: state.online,
    storedAt: state.storedAt,
    profile: state.profile?.data ?? null,
    files: state.uploads?.data ?? [],
    log: state.log,
    sessionLost,
  };
}

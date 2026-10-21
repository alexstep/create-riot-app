import { hc, type InferRequestType, type InferResponseType } from 'hono/client';
import type { AppType } from '../api/routes';
import type { FileMeta } from '../contract/schemas';
import type { Connection } from './caller';
import { connectHub } from './connect';
import type { FetchLike } from './protocol';

export type Client = ReturnType<typeof hc<AppType>>;

const shape = hc<AppType>('http://localhost');

type ProfileCall = InferRequestType<typeof shape.api.profile.$put>;
export type ProfileInput = ProfileCall extends { json: infer Json }
  ? Json
  : import('../contract/schemas').ProfileInput;
export type ProfileResponse = InferResponseType<
  typeof shape.api.profile.$put,
  200
>;
export type FieldError = InferResponseType<typeof shape.api.profile.$put, 400>;
export type UploadCreated = InferResponseType<
  typeof shape.api.uploads.$post,
  201
>;

export function createClient(origin: string, fetchImpl: FetchLike): Client {
  return hc<AppType>(origin, {
    fetch: fetchImpl,
    init: { credentials: 'include' },
  });
}

export type SaveResult =
  | { ok: true; profile: ProfileResponse }
  | { ok: false; error: string; fields: Record<string, string[]> };

export async function submitProfile(
  client: Client,
  input: ProfileInput,
): Promise<SaveResult> {
  const res = await client.api.profile.$put({ json: input });
  if (!res.ok) {
    const body = await res.json();
    return { ok: false, error: body.error, fields: body.fields ?? {} };
  }
  return { ok: true, profile: await res.json() };
}

export type UploadResult =
  | { ok: true; data: UploadCreated }
  | { ok: false; error: string; fields: Record<string, string[]> };

export async function uploadFiles(
  conn: Connection,
  client: Client,
  files: File[],
  onProgress?: (progress: { loaded: number; total: number }) => void,
): Promise<UploadResult> {
  const url = client.api.uploads.$url().toString();
  const prepared = await Promise.all(
    files.map(async (file) => ({
      field: 'files',
      filename: file.name,
      type: file.type || 'application/octet-stream',
      buffer: await file.arrayBuffer(),
    })),
  );
  const result = await conn.upload(url, prepared, onProgress);
  const json: unknown = JSON.parse(new TextDecoder().decode(result.body));
  if (result.status === 201 && isUpload(json)) return { ok: true, data: json };
  if (isFieldError(json))
    return { ok: false, error: json.error, fields: json.fields ?? {} };
  return { ok: false, error: 'Upload failed', fields: {} };
}

export function downloadUrl(client: Client, id: string): string {
  const list = client.api.uploads.$url();
  return new URL(
    id,
    new URL(`${list.pathname.replace(/\/$/, '')}/`, list.origin),
  ).toString();
}

function isUpload(value: unknown): value is UploadCreated {
  if (!value || typeof value !== 'object') return false;
  const files = (value as { files?: unknown }).files;
  return Array.isArray(files);
}

function isFieldError(value: unknown): value is FieldError {
  return (
    !!value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

export type ListedFile = FileMeta;

let browserClient: Promise<Client> | null = null;

function clientInBrowser(): Promise<Client> {
  browserClient ??= connectHub(globalThis.location.origin).then((connection) =>
    createClient(globalThis.location.origin, connection.fetch),
  );
  return browserClient;
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await clientInBrowser();
  const response = await client.api.login.$post({ json: { email, password } });
  if (!response.ok) {
    const body: unknown = await response.json();
    const error =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : 'Could not log in.';
    return { ok: false, error };
  }
  return { ok: true };
}

export async function logout(): Promise<void> {
  const client = await clientInBrowser();
  await client.api.logout.$post();
}

export async function currentEmail(): Promise<string> {
  const client = await clientInBrowser();
  const response = await client.api.me.$get();
  if (!response.ok) return '';
  const body: unknown = await response.json();
  if (
    body &&
    typeof body === 'object' &&
    'email' in body &&
    typeof body.email === 'string'
  )
    return body.email;
  return '';
}

export async function sendContact(
  email: string,
  message: string,
): Promise<boolean> {
  const client = await clientInBrowser();
  const response = await client.api.contact.$post({ json: { email, message } });
  return response.ok;
}

export interface Item {
  id: string;
  title: string;
}

export async function listItems(): Promise<Item[]> {
  const client = await clientInBrowser();
  const response = await client.api.items.$get();
  if (!response.ok) return [];
  const body: unknown = await response.json();
  if (
    body &&
    typeof body === 'object' &&
    'items' in body &&
    Array.isArray(body.items)
  ) {
    return body.items as Item[];
  }
  return [];
}

export async function createItem(title: string): Promise<Item | null> {
  const client = await clientInBrowser();
  const response = (await client.api.items.$post({
    json: { title },
  })) as unknown as Response;
  if (!response.ok) return null;
  return (await response.json()) as Item;
}

export interface Photo {
  albumId: number;
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string;
}

export async function getPhotos(limit = 10): Promise<Photo[]> {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/photos?_limit=${limit}`,
  );
  if (!response.ok) throw new Error(`Demo API answered ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data as Photo[];
}

export async function deleteItem(id: string): Promise<boolean> {
  const client = await clientInBrowser();
  const response = await client.api.items.$delete({ param: { id } });
  return response.ok;
}

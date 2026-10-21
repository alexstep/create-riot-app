import { hc } from 'hono/client';
import type { AppType } from '../api/routes';

const PHOTOS_URL = 'https://jsonplaceholder.typicode.com/';

/**
 * Browser calls to this app. Screens and islands import these functions.
 * The Hono client stays in this file so the data layer can be replaced
 * without touching the UI.
 */
const client = hc<AppType>('/', { init: { credentials: 'include' } });

export interface Photo {
  albumId: number;
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string;
}

export interface Item {
  id: string;
  title: string;
}

export async function getPhotos(limit = 10): Promise<Photo[]> {
  const response = await fetch(`${PHOTOS_URL}photos?_limit=${limit}`);
  if (!response.ok) throw new Error(`Demo API answered ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data as Photo[];
}

function errorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }
  return fallback;
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await client.api.login.$post({ json: { email, password } });
  if (!response.ok) {
    return {
      ok: false,
      error: errorMessage(await response.json(), 'Could not log in.'),
    };
  }
  return { ok: true };
}

export async function logout(): Promise<void> {
  await client.api.logout.$post();
}

export async function currentEmail(): Promise<string> {
  const response = await client.api.me.$get();
  if (!response.ok) return '';
  const body: unknown = await response.json();
  if (
    body &&
    typeof body === 'object' &&
    'email' in body &&
    typeof body.email === 'string'
  ) {
    return body.email;
  }
  return '';
}

export async function sendContact(
  email: string,
  message: string,
): Promise<boolean> {
  const response = await client.api.contact.$post({ json: { email, message } });
  return response.ok;
}

export async function listItems(): Promise<Item[]> {
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
  const response = await client.api.items.$post({ json: { title } });
  if (!response.ok) return null;
  return (await response.json()) as Item;
}

export async function deleteItem(id: string): Promise<boolean> {
  const response = await client.api.items.$delete({ param: { id } });
  return response.ok;
}

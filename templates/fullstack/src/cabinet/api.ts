import { hc } from 'hono/client';
import type { AppType } from '../api/routes';

const PHOTOS_URL = 'https://jsonplaceholder.typicode.com/';

export interface Photo {
  albumId: number;
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string;
}

export async function getPhotos(limit = 10): Promise<Photo[]> {
  const response = await fetch(`${PHOTOS_URL}photos?_limit=${limit}`);
  if (!response.ok) throw new Error(`Demo API answered ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data as Photo[];
}

export const client = hc<AppType>('/', { init: { credentials: 'include' } });

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

export async function logout(): Promise<void> {
  await client.api.logout.$post();
}

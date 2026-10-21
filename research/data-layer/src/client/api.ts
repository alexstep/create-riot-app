import { hc, type InferRequestType, type InferResponseType } from 'hono/client'
import type { AppType } from '../server/app'
import type { Connection } from './caller'
import type { FetchLike } from './protocol'
import type { FileMeta } from '../contract/schemas'

export type Client = ReturnType<typeof hc<AppType>>

const shape = hc<AppType>('http://localhost')

export type ProfileInput = InferRequestType<typeof shape.api.profile.$put>['json']
export type ProfileResponse = InferResponseType<typeof shape.api.profile.$put, 200>
export type FieldError = InferResponseType<typeof shape.api.profile.$put, 400>
export type UploadCreated = InferResponseType<typeof shape.api.uploads.$post, 201>

export function createClient(origin: string, fetchImpl: FetchLike): Client {
  return hc<AppType>(origin, {
    fetch: fetchImpl,
    init: { credentials: 'include' },
  })
}

export type SaveResult =
  | { ok: true; profile: ProfileResponse }
  | { ok: false; error: string; fields: Record<string, string[]> }

export async function submitProfile(client: Client, input: ProfileInput): Promise<SaveResult> {
  const res = await client.api.profile.$put({ json: input })
  if (!res.ok) {
    const body = await res.json()
    return { ok: false, error: body.error, fields: body.fields ?? {} }
  }
  return { ok: true, profile: await res.json() }
}

export type UploadResult =
  | { ok: true; data: UploadCreated }
  | { ok: false; error: string; fields: Record<string, string[]> }

export async function uploadFiles(
  conn: Connection,
  client: Client,
  files: File[],
  onProgress?: (progress: { loaded: number; total: number }) => void,
): Promise<UploadResult> {
  const url = client.api.uploads.$url().toString()
  const prepared = await Promise.all(files.map(async (file) => ({
    field: 'files',
    filename: file.name,
    type: file.type || 'application/octet-stream',
    buffer: await file.arrayBuffer(),
  })))
  const result = await conn.upload(url, prepared, onProgress)
  const json: unknown = JSON.parse(new TextDecoder().decode(result.body))
  if (result.status === 201 && isUpload(json)) return { ok: true, data: json }
  if (isFieldError(json)) return { ok: false, error: json.error, fields: json.fields ?? {} }
  return { ok: false, error: 'Upload failed', fields: {} }
}

export function downloadUrl(client: Client, id: string): string {
  return client.api.uploads[':id'].$url({ param: { id } }).toString()
}

function isUpload(value: unknown): value is UploadCreated {
  if (!value || typeof value !== 'object') return false
  const files = (value as { files?: unknown }).files
  return Array.isArray(files)
}

function isFieldError(value: unknown): value is FieldError {
  return !!value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
}

export type ListedFile = FileMeta

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { mediaType, type AllowedType, type FileMeta } from '../contract/schemas'

const EXT: Record<AllowedType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'text/plain': '.txt',
  'application/pdf': '.pdf',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function displayName(name: string): string {
  const base = name.replaceAll('\\', '/').split('/').pop() ?? 'file'
  const cleaned = base.replace(/[\r\n"]/g, '').replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120)
  return cleaned || 'file'
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_') || 'file'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Reject a claimed MIME whose bytes are a different format. */
export function matchesType(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/png') {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  }
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (type === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    )
  }
  if (type === 'application/pdf') {
    return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  }
  if (type === 'text/plain') {
    const n = Math.min(bytes.length, 512)
    for (let i = 0; i < n; i++) if (bytes[i] === 0) return false
    return true
  }
  return false
}

export function storedName(meta: { id: string; type: string }): string | null {
  if (!UUID.test(meta.id)) return null
  const ext = EXT[meta.type as AllowedType]
  if (!ext) return null
  return `${meta.id}${ext}`
}

/** Resolve a stored name and refuse anything that escapes the upload directory. */
export function resolveInside(dir: string, name: string): string | null {
  if (name !== path.basename(name)) return null
  const root = path.resolve(dir)
  const target = path.resolve(root, name)
  if (target !== path.join(root, name)) return null
  if (!target.startsWith(root + path.sep)) return null
  return target
}

export class UploadStore {
  files: FileMeta[] = []
  version = 0

  constructor(readonly dir: string) {}

  async init(clean: boolean): Promise<void> {
    if (clean) await rm(this.dir, { recursive: true, force: true })
    await mkdir(this.dir, { recursive: true })
    if (clean) return
    try {
      const raw = await readFile(path.join(this.dir, 'manifest.json'), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) this.files = parsed as FileMeta[]
    } catch {
      this.files = []
    }
  }

  async save(file: File): Promise<FileMeta | { error: string }> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = mediaType(file.type)
    if (!matchesType(bytes, type)) {
      return { error: 'File contents do not match its type' }
    }
    const id = crypto.randomUUID()
    const name = storedName({ id, type })
    if (!name) return { error: 'Unsupported file type' }
    const target = resolveInside(this.dir, name)
    if (!target) return { error: 'Could not store the file' }
    await writeFile(target, bytes)
    const meta: FileMeta = {
      id,
      name: displayName(file.name),
      type,
      size: bytes.byteLength,
      createdAt: Date.now(),
    }
    this.files.push(meta)
    await this.persist()
    return meta
  }

  filePath(id: string): { meta: FileMeta; path: string } | null {
    const meta = this.files.find((file) => file.id === id)
    if (!meta) return null
    const name = storedName(meta)
    if (!name) return null
    const target = resolveInside(this.dir, name)
    if (!target) return null
    return { meta, path: target }
  }

  private async persist(): Promise<void> {
    const target = path.join(this.dir, 'manifest.json')
    const tmp = path.join(this.dir, `.manifest-${crypto.randomUUID()}.json`)
    await writeFile(tmp, JSON.stringify(this.files))
    const { rename } = await import('node:fs/promises')
    await rename(tmp, target)
  }
}

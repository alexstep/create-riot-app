import type { FetchLike, UploadPart } from './protocol';

export type UploadRequest = {
  url: string;
  headers: [string, string][];
  fields: Record<string, string>;
  files: UploadPart[];
  onProgress: (loaded: number, total: number) => void;
};

export type UploadResponse = {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
};

/**
 * Upload progress does not exist on fetch(). Prefer XMLHttpRequest, which reports
 * bytes the browser has handed to the network. Fall back to a pull-based multipart
 * stream: progress advances as the runtime reads the body, which is the closest
 * fetch can get.
 */
export function uploadWithProgress(
  input: UploadRequest,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): Promise<UploadResponse> {
  if (typeof XMLHttpRequest !== 'undefined') return uploadXhr(input);
  return uploadStream(input, fetchImpl);
}

function uploadXhr(input: UploadRequest): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', input.url);
    xhr.withCredentials = true;
    xhr.responseType = 'arraybuffer';
    for (const [key, value] of input.headers) {
      if (key.toLowerCase() === 'content-type') continue;
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      const headers = xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/)
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf(':');
          return [line.slice(0, index), line.slice(index + 1).trim()] as [
            string,
            string,
          ];
        });
      const body = new Uint8Array(xhr.response as ArrayBuffer);
      resolve({ status: xhr.status, headers, body });
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    const form = new FormData();
    for (const [key, value] of Object.entries(input.fields))
      form.append(key, value);
    for (const file of input.files) {
      form.append(
        file.field,
        new File([file.buffer], file.filename, { type: file.type }),
      );
    }
    xhr.send(form);
  });
}

async function uploadStream(
  input: UploadRequest,
  fetchImpl: FetchLike,
): Promise<UploadResponse> {
  const boundary = `Riot${crypto.randomUUID().replaceAll('-', '')}`;
  const parts = multipartParts(input, boundary);
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  let index = 0;
  let loaded = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const part = parts[index];
      if (!part) {
        controller.close();
        return;
      }
      index += 1;
      loaded += part.byteLength;
      input.onProgress(loaded, total);
      controller.enqueue(part);
    },
  });
  const res = await fetchImpl(input.url, {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: stream,
    duplex: 'half',
    credentials: 'include',
  } as RequestInit);
  const body = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, headers: [...res.headers.entries()], body };
}

function multipartParts(input: UploadRequest, boundary: string): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (const [key, value] of Object.entries(input.fields)) {
    parts.push(fieldPart(boundary, key, value));
  }
  for (const file of input.files) {
    parts.push(filePart(boundary, file));
  }
  parts.push(text(`--${boundary}--\r\n`));
  return parts;
}

function fieldPart(boundary: string, name: string, value: string): Uint8Array {
  return text(
    `--${boundary}\r\nContent-Disposition: form-data; name="${escapeName(name)}"\r\n\r\n${value}\r\n`,
  );
}

function filePart(boundary: string, file: UploadPart): Uint8Array {
  const head = text(
    `--${boundary}\r\nContent-Disposition: form-data; name="${escapeName(file.field)}"; filename="${escapeName(file.filename)}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
  );
  const tail = text('\r\n');
  const bytes = new Uint8Array(file.buffer);
  const out = new Uint8Array(head.length + bytes.length + tail.length);
  out.set(head, 0);
  out.set(bytes, head.length);
  out.set(tail, head.length + bytes.length);
  return out;
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function escapeName(value: string): string {
  return value.replaceAll('"', '');
}

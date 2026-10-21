/** A fresh ArrayBuffer. TS 7 rejects Uint8Array<ArrayBufferLike> as a fetch body. */
export function bytesBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

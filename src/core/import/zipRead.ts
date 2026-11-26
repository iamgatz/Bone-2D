/**
 * A small ZIP reader for the files other programs write (an OpenRaster picture is one): the central directory, stored and deflated
 * entries. The unpacking is the browser's own (`DecompressionStream`). No ZIP64, no encryption.
 */

/** More than this in one entry is not a picture of a character, it is a broken or hostile file. */
const LIMIT = 256 * 1024 * 1024;

/** The entries of an archive by name; the data of one is unpacked when it is asked for. */
export function readZip(buffer: ArrayBuffer): Map<string, () => Promise<Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // the end record is the last 22 bytes, unless the archive carries a comment (at most 64 KB)
  let end = bytes.length - 22;
  while (end >= 0 && end > bytes.length - 22 - 0x10000 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error('not a ZIP archive');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const text = new TextDecoder();
  const out = new Map<string, () => Promise<Uint8Array>>();
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('the ZIP directory is broken');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const skip = view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = text.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + skip;
    out.set(name, async () => {
      if (flags & 1) throw new Error(`${name} is encrypted`);
      if (size > LIMIT) throw new Error(`${name} is too large`);
      if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error(`${name} is not where the ZIP says`);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      if (start + packed > bytes.length) throw new Error(`${name} is cut off`);
      const data = bytes.slice(start, start + packed);
      if (method === 0) return data;
      if (method !== 8) throw new Error(`${name} is packed in a way that is not read (method ${method})`);
      return inflate(data, size, name);
    });
  }
  return out;
}

async function inflate(data: Uint8Array<ArrayBuffer>, size: number, name: string): Promise<Uint8Array> {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const out = new Uint8Array(size);
  let at = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // the size the directory promised is also the most that is ever kept
    if (at + value.length > size) {
      await reader.cancel();
      throw new Error(`${name} is longer than the ZIP says`);
    }
    out.set(value, at);
    at += value.length;
  }
  if (at !== size) throw new Error(`${name} is shorter than the ZIP says`);
  return out;
}

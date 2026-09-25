/** DUF and DSF files are JSON, optionally gzip-compressed. */
export async function readDazBytes(buf: ArrayBuffer): Promise<any> {
  let bytes = new Uint8Array(buf);
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("This file is not a readable DAZ file (expected JSON or gzip-compressed JSON).");
  }
}

export async function readDazFile(file: File): Promise<any> {
  return readDazBytes(await file.arrayBuffer());
}

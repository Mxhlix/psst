// Base64 to bytes and back, so the mod needs nothing newer than ES2023
// (Uint8Array.fromBase64 is not in every TypeScript lib yet).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i] as const))

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      ((INDEX.get(clean[i] ?? 'A') ?? 0) << 18) |
      ((INDEX.get(clean[i + 1] ?? 'A') ?? 0) << 12) |
      ((INDEX.get(clean[i + 2] ?? 'A') ?? 0) << 6) |
      (INDEX.get(clean[i + 3] ?? 'A') ?? 0)
    if (o < out.length) out[o++] = (n >> 16) & 0xff
    if (o < out.length) out[o++] = (n >> 8) & 0xff
    if (o < out.length) out[o++] = n & 0xff
  }
  return out
}

export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63]!
    out += c === undefined ? '=' : ALPHABET[n & 63]!
  }
  return out
}

// A read-only SQLite reader for one job: list the rows of a table from a
// database file plus its write-ahead log, without SQLite itself (a mod runs
// with no Node and no native code). It follows the file format at
// https://www.sqlite.org/fileformat2.html: the WAL's committed frames win over
// the main file, table b-trees are walked from their root, and payloads that
// spill into overflow pages are joined back.

export type SqlValue = null | number | string | Uint8Array

export type SqlRow = { rowid: number; values: SqlValue[] }

const WAL_MAGIC_LE = 0x377f0682
const WAL_MAGIC_BE = 0x377f0683
const MAX_PAYLOAD = 64 * 1024 * 1024

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}

function varint(b: Uint8Array, at: number): [value: number, length: number] {
  let v = 0
  for (let i = 0; i < 8; i++) {
    const c = b[at + i] ?? 0
    v = v * 128 + (c & 0x7f)
    if (c < 0x80) return [v, i + 1]
  }
  return [v * 256 + (b[at + 8] ?? 0), 9]
}

// The WAL checksum (fileformat2 section 4.4), over 8-byte steps of `b`.
function walChecksum(
  b: Uint8Array, from: number, to: number, littleEndian: boolean, s: [number, number],
): [number, number] {
  const dv = view(b)
  let [s0, s1] = s
  for (let i = from; i < to; i += 8) {
    s0 = (s0 + dv.getUint32(i, littleEndian) + s1) >>> 0
    s1 = (s1 + dv.getUint32(i + 4, littleEndian) + s0) >>> 0
  }
  return [s0, s1]
}

export class SqliteFile {
  readonly pageSize: number
  private readonly usable: number
  private readonly walPages = new Map<number, number>()
  private readonly utf8 = new TextDecoder('utf-8')

  constructor(private readonly main: Uint8Array, private readonly wal?: Uint8Array) {
    const header = 'SQLite format 3\u0000'
    for (let i = 0; i < 16; i++) {
      if (main[i] !== header.charCodeAt(i)) throw new Error('not an SQLite database')
    }
    const raw = view(main).getUint16(16)
    this.pageSize = raw === 1 ? 65536 : raw
    this.usable = this.pageSize - (main[20] ?? 0)
    if (wal) this.readWal(wal)
  }

  private readWal(wal: Uint8Array): void {
    if (wal.length < 32) return
    const dv = view(wal)
    const magic = dv.getUint32(0)
    if (magic !== WAL_MAGIC_LE && magic !== WAL_MAGIC_BE) return
    if (dv.getUint32(8) !== this.pageSize) return
    const little = magic === WAL_MAGIC_LE
    let sum = walChecksum(wal, 0, 24, little, [0, 0])
    if (sum[0] !== dv.getUint32(24) || sum[1] !== dv.getUint32(28)) return
    const salt1 = dv.getUint32(16)
    const salt2 = dv.getUint32(20)

    const pending = new Map<number, number>()
    for (let at = 32; at + 24 + this.pageSize <= wal.length; at += 24 + this.pageSize) {
      if (dv.getUint32(at + 8) !== salt1 || dv.getUint32(at + 12) !== salt2) break
      sum = walChecksum(wal, at, at + 8, little, sum)
      sum = walChecksum(wal, at + 24, at + 24 + this.pageSize, little, sum)
      if (sum[0] !== dv.getUint32(at + 16) || sum[1] !== dv.getUint32(at + 20)) break
      pending.set(dv.getUint32(at), at + 24)
      if (dv.getUint32(at + 4) !== 0) {
        for (const [page, offset] of pending) this.walPages.set(page, offset)
        pending.clear()
      }
    }
  }

  page(n: number): Uint8Array | undefined {
    const inWal = this.walPages.get(n)
    if (inWal !== undefined && this.wal) return this.wal.subarray(inWal, inWal + this.pageSize)
    const from = (n - 1) * this.pageSize
    if (n < 1 || from + this.pageSize > this.main.length) return undefined
    return this.main.subarray(from, from + this.pageSize)
  }

  // Every row of the table b-tree rooted at `root`, in rowid order.
  rows(root: number): SqlRow[] {
    const out: SqlRow[] = []
    const seen = new Set<number>()
    const walk = (n: number, depth: number): void => {
      if (depth > 40 || seen.has(n)) return
      seen.add(n)
      const p = this.page(n)
      if (!p) return
      const h = n === 1 ? 100 : 0
      const dv = view(p)
      const kind = p[h]
      const cells = dv.getUint16(h + 3)
      if (kind === 0x05) {
        for (let i = 0; i < cells; i++) walk(dv.getUint32(dv.getUint16(h + 12 + i * 2)), depth + 1)
        walk(dv.getUint32(h + 8), depth + 1)
      } else if (kind === 0x0d) {
        for (let i = 0; i < cells; i++) {
          // A page read while SQLite rewrites it can hold garbage; one bad
          // cell is skipped rather than failing the whole table.
          try {
            const row = this.leafCell(p, dv.getUint16(h + 8 + i * 2))
            if (row) out.push(row)
          } catch {
            continue
          }
        }
      }
    }
    walk(root, 0)
    return out
  }

  // The rows of a table found by name in the schema on page 1, or undefined
  // when the schema has no such table.
  table(name: string): SqlRow[] | undefined {
    const entry = this.rows(1).find(r => r.values[0] === 'table' && r.values[1] === name)
    const root = entry?.values[3]
    return typeof root === 'number' ? this.rows(root) : undefined
  }

  private leafCell(p: Uint8Array, at: number): SqlRow | undefined {
    const [size, l1] = varint(p, at)
    const [rowid, l2] = varint(p, at + l1)
    const start = at + l1 + l2
    // No row of this database comes near this size, and none can be larger
    // than the files it is read from; a larger one is garbage.
    if (size > MAX_PAYLOAD || size > this.main.length + (this.wal?.length ?? 0)) return undefined
    const u = this.usable
    const maxLocal = u - 35
    let local = size
    if (size > maxLocal) {
      const minLocal = Math.floor(((u - 12) * 32) / 255) - 23
      const k = minLocal + ((size - minLocal) % (u - 4))
      local = k <= maxLocal ? k : minLocal
    }
    const payload = new Uint8Array(size)
    payload.set(p.subarray(start, start + local))
    if (local < size) {
      let next = view(p).getUint32(start + local)
      let filled = local
      const seen = new Set<number>()
      while (next !== 0 && filled < size && !seen.has(next)) {
        seen.add(next)
        const o = this.page(next)
        if (!o) return undefined
        const take = Math.min(u - 4, size - filled)
        payload.set(o.subarray(4, 4 + take), filled)
        filled += take
        next = view(o).getUint32(0)
      }
      if (filled < size) return undefined
    }
    return { rowid, values: decodeRecord(payload, this.utf8) }
  }
}

// One record (fileformat2 section 2.1): a header of serial types, then the
// values. A header longer than the record is garbage and yields no values.
export function decodeRecord(b: Uint8Array, utf8 = new TextDecoder('utf-8')): SqlValue[] {
  const [headerSize, l] = varint(b, 0)
  if (headerSize > b.length) return []
  const types: number[] = []
  for (let at = l; at < headerSize; ) {
    const [t, n] = varint(b, at)
    types.push(t)
    at += n
  }
  const dv = view(b)
  const out: SqlValue[] = []
  let at = headerSize
  for (const t of types) {
    if (t === 0) out.push(null)
    else if (t >= 1 && t <= 6) {
      const width = [0, 1, 2, 3, 4, 6, 8][t] ?? 0
      let v = 0n
      for (let i = 0; i < width; i++) v = (v << 8n) | BigInt(b[at + i] ?? 0)
      const bits = BigInt(width * 8)
      if (v >= 1n << (bits - 1n)) v -= 1n << bits
      out.push(Number(v))
      at += width
    } else if (t === 7) {
      out.push(dv.getFloat64(at))
      at += 8
    } else if (t === 8 || t === 9) out.push(t - 8)
    else if (t >= 12) {
      const len = t % 2 === 0 ? (t - 12) / 2 : (t - 13) / 2
      const bytes = b.subarray(at, at + len)
      out.push(t % 2 === 0 ? bytes : utf8.decode(bytes))
      at += len
    } else out.push(null)
  }
  return out
}

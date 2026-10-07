import { expect, test } from 'claude-code/testing'

import { fromBase64 } from '../hooks/base64'
import { decodeRecord, SqliteFile } from '../hooks/sqlite'
import { MAIN_B64, WAL_B64 } from './fixtures/fixture'

const main = fromBase64(MAIN_B64)
const wal = fromBase64(WAL_B64)

const keys = (db: SqliteFile) => (db.table('notifications') ?? []).map(r => r.values[1])

test('reads committed rows from the WAL, not the stale main file', () => {
  expect(keys(new SqliteFile(main))).toEqual([])
  expect(keys(new SqliteFile(main, wal))).toEqual(['k-mail', 'k-food', 'k-summary', 'k-long', 'k-music'])
})

test('a deleted row is gone and an updated row has its new content', () => {
  const rows = new SqliteFile(main, wal).table('notifications')!
  const food = rows.find(r => r.values[1] === 'k-food')

  expect(rows.some(r => r.values[1] === 'k-gone')).toBe(false)
  expect(String(food?.values[3])).toContain('Arriving in 12 min')
})

test('joins a payload that spills into overflow pages', () => {
  const long = new SqliteFile(main, wal).table('notifications')!.find(r => r.values[1] === 'k-long')
  const json = JSON.parse(String(long?.values[3])) as { text: string }

  expect(json.text.length).toBe(9000)
})

test('the integer primary key comes back as the rowid', () => {
  const rows = new SqliteFile(main, wal).table('notifications')!

  expect(rows.map(r => r.rowid)).toEqual([1, 2, 3, 5, 6])
  expect(rows[0]?.values[4]).toBe(1791273227000)
})

test('a torn last frame drops only the transaction it ends', () => {
  const torn = new SqliteFile(main, wal.slice(0, wal.length - 100)).table('notifications')!
  const food = torn.find(r => r.values[1] === 'k-food')

  // The delete and the update were the last transaction: without its commit
  // frame the earlier, committed state stands.
  expect(torn.map(r => r.values[1])).toEqual(['k-mail', 'k-food', 'k-summary', 'k-gone', 'k-long', 'k-music'])
  expect(String(food?.values[3])).toContain('Order received')
})

test('ignores a WAL whose header does not match its checksum', () => {

  const foreign = wal.slice()
  foreign[16] = (foreign[16] ?? 0) ^ 0xff // header salt no longer matches its own checksum
  expect(keys(new SqliteFile(main, foreign))).toEqual([])
})

test('refuses a file that is not SQLite', () => {
  expect(() => new SqliteFile(new Uint8Array(4096))).toThrow()
})

test('a record whose header claims more than the record holds yields nothing, at once', () => {
  // Header size 2^56: a varint of nine bytes, as garbage from a torn page can be.
  const garbage = new Uint8Array([0x81, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00, 0x17, 0x41])
  expect(decodeRecord(garbage)).toEqual([])
})

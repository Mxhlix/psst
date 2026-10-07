import { expect, test } from 'claude-code/testing'

import { changed, hiddenText, knownOf, parseList, toastText, toNotices } from '../hooks/notices'
import type { Filter } from '../hooks/notices'
import { fromBase64 } from '../hooks/base64'
import { SqliteFile } from '../hooks/sqlite'
import { MAIN_B64, WAL_B64 } from './fixtures/fixture'

const rows = new SqliteFile(fromBase64(MAIN_B64), fromBase64(WAL_B64)).table('notifications')!
const all: Filter = { only: [], ignore: [], ongoing: false }
const shown = (filter: Filter) => toNotices(rows, filter).shown

test('turns rows into notices, newest first, without bundle summaries', () => {
  const list = shown(all)

  expect(list.map(n => n.key)).toEqual(['k-food', 'k-long', 'k-mail'])
  expect(list[0]).toEqual({
    key: 'k-food',
    packageName: 'com.example.food',
    app: 'FoodNow',
    title: 'On the way',
    text: 'Arriving in 12 min',
    body: '',
    postTime: 1791273400000,
  })
})

test('keeps up to three lines of a mail body, without the subject or blank lines', () => {
  const mail = shown(all).find(n => n.key === 'k-mail')

  expect(mail?.text).toBe('テスト通知')
  expect(mail?.body).toBe('本文の1行目\n本文の2行目\n本文の3行目')
})

test('filters by app name or package name, case-insensitively', () => {
  expect(shown({ ...all, only: parseList('foodnow, com.example.mail') }).map(n => n.key)).toEqual(['k-food', 'k-mail'])
  expect(shown({ ...all, ignore: parseList('News') }).map(n => n.key)).toEqual(['k-food', 'k-mail'])
})

test('leaves out playback controls unless asked, and counts what it left out by reason', () => {
  expect(toNotices(rows, all).hidden).toEqual({ ignored: 0, notChosen: 0, ongoing: 1 })
  expect(shown({ ...all, ongoing: true }).map(n => n.key)).toEqual(['k-food', 'k-music', 'k-long', 'k-mail'])

  const narrowed = toNotices(rows, { ...all, only: parseList('Mail, Player'), ignore: parseList('News') }).hidden
  expect(narrowed).toEqual({ ignored: 1, notChosen: 1, ongoing: 1 })
  expect(hiddenText(narrowed)).toBe(
    '3 not shown: 1 playback or ongoing, 1 in your ignore list, 1 from apps not in your apps list. To change this, ask Claude to change psst\'s settings.',
  )
  expect(hiddenText({ ignored: 0, notChosen: 0, ongoing: 0 })).toBe('')
})

test('an updated notification counts as changed; an untouched one does not', () => {
  const list = shown(all)
  const before = { ...knownOf(list), 'k-food': 'an older fingerprint' }

  expect(changed(list, before).map(n => n.key)).toEqual(['k-food'])
  expect(changed(list, knownOf(list))).toEqual([])
})

test('toast text hides content on request and stays short', () => {
  const [food, long] = shown(all)

  expect(toastText(food!, true)).toBe('📱 FoodNow · On the way — Arriving in 12 min')
  expect(toastText(food!, false)).toBe('📱 FoodNow: new notification')
  expect(Array.from(toastText(long!, true))).toHaveLength(160) // characters, the 📱 counted once
})

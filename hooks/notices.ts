// Turns Phone Link's notification rows into the notices this mod shows, and
// works out which of them are new or changed since the last look.

import type { Notice } from '../types'
import type { SqlRow } from './sqlite'

// `ongoing`: also show playback controls and other notifications the phone
// keeps up while something runs (left out unless asked for).
export type Filter = { only: string[]; ignore: string[]; ongoing: boolean }

// What toNotices left out, by reason, so the pane can say so.
export type Hidden = { ignored: number; notChosen: number; ongoing: number }

export const NOTHING_HIDDEN: Hidden = { ignored: 0, notChosen: 0, ongoing: 0 }

export function hiddenTotal(h: Hidden): number {
  return h.ignored + h.notChosen + h.ongoing
}

const BODY_LINES = 3

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function parseList(raw: unknown): string[] {
  return String(raw ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

function matches(n: Notice, names: string[]): boolean {
  return names.includes(n.packageName.toLowerCase()) || names.includes(n.app.toLowerCase())
}

// Columns of Phone Link's "notifications" table: id, notification_id,
// package_name, json, post_time, state, anonymous_id.
export function toNotices(rows: SqlRow[], filter: Filter): { shown: Notice[]; hidden: Hidden } {
  const out: Notice[] = []
  const hidden = { ...NOTHING_HIDDEN }
  for (const row of rows) {
    const json = row.values[3]
    if (typeof json !== 'string') continue
    let d: Record<string, unknown>
    try {
      d = JSON.parse(json) as Record<string, unknown>
    } catch {
      continue
    }
    // Android's FLAG_GROUP_SUMMARY: the line that sums up a bundle, not a
    // notification of its own. Phone Link's isGroup is true for every member
    // of a bundle, so it cannot tell the two apart.
    if (typeof d.flags === 'number' && (d.flags & 0x200) !== 0) continue
    const big = str(d.bigText).split('\n')
    const text = str(d.text) || big[0] || ''
    // bigText is the expanded notification: for a mail, the subject (the same
    // as text) and then the body.
    if (big[0] === text) big.shift()
    const body = big.filter(line => line.trim() !== '').slice(0, BODY_LINES).join('\n')
    const notice: Notice = {
      key: str(d.key) || str(row.values[1]) || String(row.rowid),
      packageName: str(d.packageName) || str(row.values[2]),
      app: str(d.appName) || str(row.values[2]),
      title: str(d.title),
      text,
      body,
      postTime: typeof d.postTime === 'number' ? d.postTime : 0,
    }
    if (matches(notice, filter.ignore)) {
      hidden.ignored += 1
      continue
    }
    if (filter.only.length > 0 && !matches(notice, filter.only)) {
      hidden.notChosen += 1
      continue
    }
    // Playback controls (Android's category "transport", from a video or
    // music app) and notifications the phone keeps up while something runs
    // (isOngoing: a download, navigation, a call). They are not messages, and
    // they change on every play and pause.
    if (!filter.ongoing && (d.category === 'transport' || d.isOngoing === true)) {
      hidden.ongoing += 1
      continue
    }
    out.push(notice)
  }
  return { shown: out.sort((a, b) => b.postTime - a.postTime), hidden }
}

// The pane's last line when something was left out, or '' when nothing was.
export function hiddenText(h: Hidden): string {
  const total = hiddenTotal(h)
  if (total === 0) return ''
  const parts = [
    h.ongoing > 0 ? `${h.ongoing} playback or ongoing` : '',
    h.ignored > 0 ? `${h.ignored} in your ignore list` : '',
    h.notChosen > 0 ? `${h.notChosen} from apps not in your apps list` : '',
  ].filter(Boolean)
  return `${total} not shown: ${parts.join(', ')}. To change this, ask Claude to change psst's settings.`
}

// A short hash of what a notification says, so a change can be told without
// keeping the text itself (FNV-1a over the UTF-16 units, 32 bits).
export function fingerprint(n: Notice): string {
  const s = `${n.postTime}|${n.title}|${n.text}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

// What is kept in memory when content is hidden: the app, the package name,
// the notification key and the time, never the sender or the text.
export function withoutContent(n: Notice): Notice {
  return { ...n, title: '', text: '', body: '' }
}

// Notices that are new, or whose content changed (a delivery app rewriting
// its one notification, for example), against what was seen before.
export function changed(notices: Notice[], known: Readonly<Record<string, string>>): Notice[] {
  return notices.filter(n => known[n.key] !== fingerprint(n))
}

export function knownOf(notices: Notice[]): Record<string, string> {
  return Object.fromEntries(notices.map(n => [n.key, fingerprint(n)]))
}

export function toastText(n: Notice, showContent: boolean): string {
  if (!showContent) return `📱 ${n.app}: new notification`
  const body = [n.title, n.text].filter(Boolean).join(' — ')
  const line = body ? `📱 ${n.app} · ${body}` : `📱 ${n.app}`
  // Cut by characters, not UTF-16 units, so an emoji is never split in half.
  const chars = Array.from(line)
  return chars.length > 160 ? `${chars.slice(0, 157).join('')}...` : line
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

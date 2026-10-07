import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Notice } from '../types'
import { ago, changed, hiddenText, knownOf, NOTHING_HIDDEN, parseList, toastText, toNotices, withoutContent } from './notices'
import type { Hidden } from './notices'
import type { Filter } from './notices'
import { fromBase64 } from './base64'
import { bandApps, ICON_PX, iconsOf } from './icons'
import { SqliteFile } from './sqlite'


const PANE = 'psst'
const notices = atom({ plugin: 'psst', key: 'notices' } as const, [] as Notice[])
const known = atom({ plugin: 'psst', key: 'known' } as const, {} as Record<string, string>)
const primed = atom({ plugin: 'psst', key: 'primed' } as const, false)
const problem = atom({ plugin: 'psst', key: 'problem' } as const, '')
// Bumped when the icons are read again, so the band and the pane redraw with them.
const iconsRead = atom({ plugin: 'psst', key: 'iconsRead' } as const, 0)
// How many notifications on the phone were left out, by reason (counts only).
const hidden = atom({ plugin: 'psst', key: 'hidden' } as const, NOTHING_HIDDEN as Hidden)

const PHONE_LINK = 'Microsoft.YourPhone_8wekyb3d8bbwe'
const MAX_READ = 4 * 1024 * 1024 // what one $.fs.read may copy
const POLL_MS = 5000
const MAX_TOASTS = 3
const PANE_ICON_PX = 32

type Watch = Filter & {
  dir: string
  stamp: string
  showContent: boolean
  // The short notice when a notification arrives; off until /phone notices on,
  // since Phone Link can show its own Windows banner.
  showToasts: boolean
  emptyReads: number
  // True while a poll runs; a tick that comes meanwhile is skipped, so two
  // polls never judge the same notification new against the same old state.
  busy: boolean
  // Package name to an SVG of its icon, the phoneapps files they came from,
  // and the packages that were on the phone at that read (a package among
  // them with no icon has none in phoneapps.db; it is not looked for again).
  icons: Map<string, string>
  iconsStamp: string
  iconsChecked: Set<string>
}

// Phone Link keeps one folder per linked phone under LocalCache\Indexed.
async function findDatabase($: EngineInterface, configured: string): Promise<string | undefined> {
  if (configured) {
    return (await $.fs.exists(`${configured}\\notifications.db`)) ? configured : undefined
  }
  const local = await $.env.get('LOCALAPPDATA')
  if (!local) return undefined
  const indexed = `${local}\\Packages\\${PHONE_LINK}\\LocalCache\\Indexed`
  if (!(await $.fs.exists(indexed))) return undefined
  const dirs = (await $.fs.list(indexed)).filter(e => e.kind === 'dir')
  for (const d of dirs) {
    const dir = `${indexed}\\${d.name}\\System\\Database`
    if (await $.fs.exists(`${dir}\\notifications.db`)) return dir
  }
  return undefined
}

async function report($: EngineInterface, text: string): Promise<void> {
  if ((await read($, problem)) === text) return
  await update($, problem, () => text)
  $.ui.status(text ? `📱 ${text}` : undefined)
}

async function readBytes($: EngineInterface, path: string): Promise<Uint8Array> {
  const { base64 } = await $.fs.read(path, { as: 'bytes' })
  return fromBase64(base64)
}

// One of Phone Link's databases: its main file and write-ahead log, a stamp
// that changes whenever either does, and whether they can be read at all.
// 'log too big' clears once the log is under 4 MB again; folding it back does
// not shrink it, but Phone Link deletes it when it quits. 'file too big' (the
// main file itself) stays while the main file is that big.
type DbFiles = { main: string; wal?: string; stamp: string; state: 'ok' | 'missing' | 'log too big' | 'file too big' }

async function look($: EngineInterface, dir: string, name: string): Promise<DbFiles> {
  const main = `${dir}\\${name}`
  const wal = `${main}-wal`
  const [mainStat, walStat] = await Promise.all([
    $.fs.stat(main).catch(() => undefined),
    $.fs.stat(wal).catch(() => undefined),
  ])
  const stamp = [mainStat, walStat].map(s => (s ? `${s.size}:${s.mtimeMs}` : '-')).join('|')
  const state = !mainStat
    ? 'missing'
    : mainStat.size > MAX_READ
      ? 'file too big'
      : (walStat?.size ?? 0) > MAX_READ
        ? 'log too big'
        : 'ok'
  return { main, wal: walStat ? wal : undefined, stamp, state }
}

async function open($: EngineInterface, f: DbFiles): Promise<SqliteFile> {
  return new SqliteFile(await readBytes($, f.main), f.wal ? await readBytes($, f.wal) : undefined)
}

const USAGE = 'Use /phone to open the notifications pane, or /phone notices on or /phone notices off for the short notice when one arrives.'

// Whether the short notice shows is kept in psst's own store, so it stays as
// set in later sessions. The desktop app lists no settings rows for a mod it
// loads, so this cannot be a userConfig field changed through $.config.
const NOTICES = 'notices'

async function setNotices($: EngineInterface, w: Watch, value: 'on' | 'off'): Promise<string> {
  const turnOn = value === 'on'
  const already = w.showToasts === turnOn
  // Written even when this session already had it, since another session may
  // have stored the other value since this one started.
  await $.store.set(NOTICES, value)
  w.showToasts = turnOn
  if (already) return `Short notices are already ${value}.`
  return turnOn
    ? 'Short notices turned on: one shows for 8 seconds when a notification arrives.'
    : 'Short notices turned off.'
}

async function sayCount($: EngineInterface): Promise<void> {
  const issue = await read($, problem)
  $.ui.status(issue ? `📱 ${issue}` : `📱 ${(await read($, notices)).length}`)
}

// Icons only change when the phone gets a new app or an app updates its own,
// so phoneapps.db is read again only when a package not seen at the last read
// shows up, and only if the file has changed since.
async function loadIcons($: EngineInterface, w: Watch, list: Notice[]): Promise<void> {
  if (list.every(n => w.icons.has(n.packageName) || w.iconsChecked.has(n.packageName))) return
  const f = await look($, w.dir, 'phoneapps.db')
  if (f.state !== 'ok' || f.stamp === w.iconsStamp) return
  w.icons = iconsOf((await open($, f)).table('phone_apps') ?? [])
  w.iconsStamp = f.stamp
  w.iconsChecked = new Set(list.map(n => n.packageName))
  await update($, iconsRead, n => n + 1)
}

async function poll($: EngineInterface, w: Watch): Promise<void> {
  if (w.busy) return
  w.busy = true
  try {
    await pollOnce($, w)
  } finally {
    w.busy = false
  }
}

async function pollOnce($: EngineInterface, w: Watch): Promise<void> {
  const f = await look($, w.dir, 'notifications.db')
  if (f.stamp === w.stamp) {
    // Nothing new, but say the count again: a screen that attached since the
    // last change (the desktop app attaches after the session starts) has not
    // drawn it yet.
    return sayCount($)
  }
  if (f.state === 'missing') return report($, 'Phone Link notifications file is gone')
  if (f.state === 'log too big') return report($, 'Phone Link log is over 4 MB, more than a mod can read; quit Phone Link and open it again')
  if (f.state === 'file too big') return report($, 'Phone Link notifications file is over 4 MB, more than a mod can read')

  const rows = (await open($, f)).table('notifications')
  // Phone Link's storage is not a public interface. If an update drops the
  // table or moves the notification out of its JSON column, say so rather
  // than showing an empty phone.
  const changedForm = rows === undefined || (rows.length > 0 && rows.every(r => typeof r.values[3] !== 'string'))
  const sorted = changedForm ? { shown: [], hidden: NOTHING_HIDDEN } : toNotices(rows, w)
  const list = sorted.shown
  const before = await read($, known)

  // A read that lands while SQLite folds the log back into the main file can
  // see neither copy and come back empty, or without its schema. Taken at face
  // value it would forget every notification and toast them all again on the
  // next look, so a sudden drop to nothing, or a missing table, is read again
  // on the next two ticks before it is believed.
  if ((changedForm || (list.length === 0 && Object.keys(before).length > 0)) && w.emptyReads < 2) {
    w.emptyReads += 1
    return
  }
  w.emptyReads = 0
  if (changedForm) return report($, 'Phone Link storage has changed; this version of the mod cannot read it')
  w.stamp = f.stamp
  // An icon that cannot be read leaves the app's name in its place.
  await loadIcons($, w, list).catch(() => undefined)

  if (w.showToasts && (await read($, primed))) {
    const fresh = changed(list, before)
    for (const n of fresh.slice(0, MAX_TOASTS)) $.ui.toast(toastText(n, w.showContent), { timeoutMs: 8000 })
    if (fresh.length > MAX_TOASTS) $.ui.toast(`📱 ${fresh.length - MAX_TOASTS} more on your phone (/phone)`, { timeoutMs: 8000 })
  }
  await update($, known, () => knownOf(list))
  // Session state can be read by other mods, so with content hidden the
  // sender and the text are dropped before anything is kept.
  await update($, notices, () => (w.showContent ? list : list.map(withoutContent)))
  await update($, hidden, () => sorted.hidden)
  await update($, primed, () => true)
  await update($, problem, () => '')
  $.ui.status(`📱 ${list.length}`)
}

export const register: Register = (on, options) => {
  const watch: Watch = {
    dir: '',
    stamp: '',
    emptyReads: 0,
    busy: false,
    icons: new Map(),
    iconsStamp: '',
    iconsChecked: new Set(),
    showContent: options.content !== 'hide',
    showToasts: false,
    only: parseList(options.apps),
    ignore: parseList(options.ignore),
    ongoing: options.ongoing === 'show',
  }

  on('session.start', async ($, e, next) => {
    watch.showToasts = (await $.store.get(NOTICES)) === 'on'
    await $.command.register({
      name: 'phone',
      description: 'Show the notifications on your phone',
      argumentHint: '[notices on|off]',
    })
    const dir = await findDatabase($, String(options.databaseFolder ?? '').trim())
    if (!dir) {
      await report($, 'Phone Link data not found (Windows with a linked Android phone is needed)')
      return next(e)
    }
    watch.dir = dir
    await poll($, watch).catch(() => report($, 'could not read Phone Link notifications'))
    $.clock.every(POLL_MS, () => {
      void poll($, watch).catch(() => report($, 'could not read Phone Link notifications'))
    })
    return next(e)
  })

  // The desktop app starts a session with no screen attached, so a status set
  // during session.start is drawn nowhere. Say it again when a screen joins.
  on('session.attach', async ($, e, next) => {
    const result = await next(e)
    await sayCount($)
    return result
  })

  // The command's output is a line of the transcript, which is saved with the
  // session and can reach the model. Notification text is other people's
  // writing, so it is never put there: where no pane can be shown, the output
  // says how many there are and why the pane is missing, nothing more.
  on('command.run', { command: 'phone' }, async ($, e) => {
    const args = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (args.length > 0) {
      if (args.length !== 2 || args[0] !== 'notices' || (args[1] !== 'on' && args[1] !== 'off')) {
        return { text: USAGE }
      }
      return { text: await setNotices($, watch, args[1]) }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Phone notifications' })
    if (opened.isPlaced) return { text: 'Phone notifications pane opened.' }
    const issue = await read($, problem)
    const count = (await read($, notices)).length
    const head = issue || `${count} notification${count === 1 ? '' : 's'} on your phone.`
    return { text: `${head} The pane could not be shown here (${opened.reason}).` }
  })

  // One card per notification, newest first: the app's own icon where the
  // screen draws pictures, the app and how long ago, then the sender, the text
  // and up to three lines of the expanded body. With content set to hide, the
  // card keeps the icon, the app and the time only.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const Svg = e.surface === 'terminal' ? undefined : $.ui.resolve(e).Svg
    const list = await read($, notices)
    const issue = await read($, problem)
    const now = await $.clock.now()
    await read($, iconsRead)
    const show = watch.showContent
    // Whatever was left out is always said, with why, so nothing is missed
    // without the person knowing.
    const notShown = hiddenText(await read($, hidden))

    if (issue !== '') {
      return (
        <Box borderStyle="round" borderColor="warning" paddingX={1}>
          <Text color="warning">{issue}</Text>
        </Box>
      )
    }
    if (list.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          <Box borderStyle="round" borderDimColor paddingX={1}>
            <Text dimColor>{notShown === '' ? 'No notifications on your phone.' : 'No notifications to show.'}</Text>
          </Box>
          {notShown !== '' ? <Text dimColor>{notShown}</Text> : null}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {list.length} on your phone · newest first
        </Text>
        {list.map(n => {
          const svg = watch.icons.get(n.packageName)
          return (
            <Box key={n.key} flexDirection="row" gap={1} borderStyle="round" borderDimColor paddingX={1}>
              {Svg !== undefined && svg !== undefined ? (
                <Svg source={svg} alt={n.app} width={PANE_ICON_PX} height={PANE_ICON_PX} />
              ) : null}
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Box flexDirection="row" justifyContent="space-between" gap={1}>
                  <Text dimColor wrap="truncate-end">{n.app}</Text>
                  <Text dimColor>{ago(now - n.postTime)}</Text>
                </Box>
                {show && n.title !== '' ? <Text bold>{n.title}</Text> : null}
                <Text>{show ? n.text : 'New notification'}</Text>
                {show && n.body !== '' ? <Text dimColor>{n.body}</Text> : null}
              </Box>
            </Box>
          )
        })}
        {notShown !== '' ? <Text dimColor>{notShown}</Text> : null}
      </Box>
    )
  })

  // The desktop app's band above the prompt: one icon per app with a
  // notification on the phone, newest first. Only which apps; the count is in
  // the status line and the text is in /phone. Nothing on the phone, nothing
  // drawn. The terminal has its status line and /phone only.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'desktop') return next(e)
    const list = await read($, notices)
    if (list.length === 0 || (await read($, problem)) !== '') return next(e)
    await read($, iconsRead)
    const { Box, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        {bandApps(list).map(a => {
          const svg = watch.icons.get(a.packageName)
          return svg ? (
            <Svg source={svg} alt={a.app} width={ICON_PX} height={ICON_PX} />
          ) : (
            <Text dimColor>{a.app}</Text>
          )
        })}
      </Box>
    )
  })
}

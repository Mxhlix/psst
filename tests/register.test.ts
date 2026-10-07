import { expect, mock, test } from 'claude-code/testing'
import type { CommandRunInput, CommandRunResult, On } from 'claude-code'

import { fromBase64, toBase64 } from '../hooks/base64'
import { APPS_B64, MAIN_B64, WAL_B64, WAL_BEFORE_LENGTH } from './fixtures/fixture'

const LOCAL = 'C:\\Users\\me\\AppData\\Local'
const INDEXED = `${LOCAL}\\Packages\\Microsoft.YourPhone_8wekyb3d8bbwe\\LocalCache\\Indexed`
const DIR = `${INDEXED}\\phone-1\\System\\Database`
const MAIN = fromBase64(MAIN_B64)
const WAL = fromBase64(WAL_B64)
const APPS = fromBase64(APPS_B64)

// A disk in memory holding Phone Link's files; `version` moves the mtime.
// `onRead` sees each read before it is answered (and may hold it); `sizeOf`
// can report a size other than the bytes held.
function phoneLinkDisk(
  on: On,
  wal: { bytes: Uint8Array; version: number },
  onRead: (path: string) => void | Promise<void> = () => {},
  sizeOf: (path: string, size: number) => number = (_, size) => size,
) {
  const files: Record<string, () => Uint8Array> = {
    [`${DIR}\\notifications.db`]: () => MAIN,
    [`${DIR}\\notifications.db-wal`]: () => wal.bytes,
    [`${DIR}\\phoneapps.db`]: () => APPS,
  }
  const file = (path: string) => files[path]?.()
  on('fs.exists', ($, e) => ({ value: e.path === INDEXED || file(e.path) !== undefined }))
  on('fs.list', () => ({ value: [{ name: 'phone-1', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  on('fs.stat', ($, e) => {
    const b = file(e.path)
    if (!b) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return { value: { kind: 'file', size: sizeOf(e.path, b.length), mtimeMs: wal.version, isLink: false } }
  })
  on('fs.read', async ($, e) => {
    await onRead(e.path)
    return { value: { base64: toBase64(file(e.path) ?? new Uint8Array()) } }
  })
}

function capture(on: On, store: Record<string, unknown> = {}) {
  // psst's own store, in memory; `stored` lists every write, as key and value.
  const stored: unknown[] = []
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    stored.push({ key: e.key, value: e.value })
    store[e.key] = e.value
    return { value: undefined }
  })
  const toasts: string[] = []
  const status: (string | undefined)[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', ($, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  return { toasts, status, stored }
}

function runPhone($: { command: { run: (input: CommandRunInput) => Promise<CommandRunResult> } }, args: string) {
  return $.command.run({ command: 'phone', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
}

test('stays quiet at start, then toasts the notification that changed', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL.slice(0, WAL_BEFORE_LENGTH), version: 1 }
  phoneLinkDisk(on, wal)
  const seen = capture(on)

  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  await runPhone($, 'notices on')
  expect(seen.toasts).toEqual([])
  expect(seen.status.at(-1)).toBe('📱 4') // mail, order received, chat, long read

  wal.bytes = WAL
  wal.version = 2
  await clock.advance(5000)

  expect(seen.toasts).toEqual(['📱 FoodNow · On the way — Arriving in 12 min'])
  expect(seen.status.at(-1)).toBe('📱 3') // the chat notification was dismissed
})

test('hides the text when asked to', { options: { content: 'hide' } }, async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL.slice(0, WAL_BEFORE_LENGTH), version: 1 }
  phoneLinkDisk(on, wal)
  const seen = capture(on)

  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  await runPhone($, 'notices on')
  wal.bytes = WAL
  wal.version = 2
  await clock.advance(5000)

  expect(seen.toasts).toEqual(['📱 FoodNow: new notification'])
})

test('shows no short notice unless notices is on, and still counts', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL.slice(0, WAL_BEFORE_LENGTH), version: 1 }
  phoneLinkDisk(on, wal)
  const seen = capture(on)

  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  wal.bytes = WAL
  wal.version = 2
  await clock.advance(5000)

  expect(seen.toasts).toEqual([])
  expect(seen.status.at(-1)).toBe('📱 3')
})


test('/phone notices on and off are kept in the mod store, and say nothing of the notifications', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL.slice(0, WAL_BEFORE_LENGTH), version: 1 }
  phoneLinkDisk(on, wal)
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  const turnedOn = await runPhone($, 'notices on')
  expect(turnedOn.text).toContain('turned on')
  expect((await runPhone($, ' Notices  ON ')).text).toContain('already on')
  for (const text of ['FoodNow', 'On the way', 'Arriving in 12 min', 'Ada Lovelace']) {
    expect(turnedOn.text).not.toContain(text)
  }

  expect((await runPhone($, 'notices off')).text).toContain('turned off')
  expect(seen.stored).toEqual([
    { key: 'notices', value: 'on' },
    { key: 'notices', value: 'on' }, // already on, written again all the same
    { key: 'notices', value: 'off' },
  ])
  wal.bytes = WAL
  wal.version = 2
  await clock.advance(5000)
  expect(seen.toasts).toEqual([])
})

test('/phone notices off is stored even when this session already had it off', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  const store: Record<string, unknown> = {}
  const seen = capture(on, store)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  store.notices = 'on' // another session turned it on meanwhile

  expect((await runPhone($, 'notices off')).text).toContain('already off')
  expect(seen.stored).toEqual([{ key: 'notices', value: 'off' }])
})

test('a later session keeps notices on as the store says', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL.slice(0, WAL_BEFORE_LENGTH), version: 1 }
  phoneLinkDisk(on, wal)
  const seen = capture(on, { notices: 'on' })
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  wal.bytes = WAL
  wal.version = 2
  await clock.advance(5000)
  expect(seen.toasts).toEqual(['📱 FoodNow · On the way — Arriving in 12 min'])
})

test('/phone with anything else says how to use it and opens nothing', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  capture(on)
  const opened: unknown[] = []
  on('ui.open', ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  for (const args of ['notices', 'notices maybe', 'help']) {
    expect((await runPhone($, args)).text).toContain('/phone notices on')
  }
  expect(opened).toEqual([])
})

test('says so when Phone Link is not there', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  on('fs.exists', () => ({ value: false }))
  const seen = capture(on)

  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  expect(seen.status.at(-1)).toContain('Phone Link data not found')
})

test('the /phone pane lists the notifications on terminal and desktop', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'psst',
      surface,
      component: 'Pane',
      requestId: 'psst',
      props: {
        title: 'Phone notifications',
        isFocused: false,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
    })
    expect(await ui.find({ text: /On the way/ })).toBeDefined()
    expect(await ui.find({ text: /Arriving in 12 min/ })).toBeDefined()
    expect(await ui.find({ text: /This one gets dismissed/ })).toBeUndefined()
    expect(await ui.find({ text: /本文の3行目/ })).toBeDefined()
    expect(await ui.find({ text: /本文の4行目/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('/phone never writes notification text into its output, even with no pane', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  capture(on)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'the attached desktop places no panes' } }))
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  const out = await $.command.run({
    command: 'phone',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  expect(out.text).toContain('3 notifications on your phone')
  expect(out.text).toContain('the attached desktop places no panes')
  for (const text of ['FoodNow', 'On the way', 'Arriving in 12 min', 'Ada Lovelace', 'Long read']) {
    expect(out.text).not.toContain(text)
  }
})

test('a read that sees nothing mid-compaction does not re-toast everything', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL, version: 1 }
  phoneLinkDisk(on, wal)
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  wal.bytes = new Uint8Array() // the log emptied while the main file is not rewritten yet
  wal.version = 2
  await clock.advance(5000)
  wal.bytes = WAL // the next look sees the rows again
  wal.version = 3
  await clock.advance(5000)

  expect(seen.toasts).toEqual([])
  expect(seen.status.at(-1)).toBe('📱 3')
})

test('clearing every notification on the phone is believed after a short wait', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL, version: 1 }
  phoneLinkDisk(on, wal)
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  wal.bytes = new Uint8Array()
  wal.version = 2
  await clock.advance(15000)

  expect(seen.status.at(-1)).toBe('📱 0')
})

test('says the count again when the desktop app attaches its screen', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  const seen = capture(on)
  on('session.attach', ($, e) => ({ clientId: e.clientId }))

  await $.session.start({ cwd: 'C:/work', surface: null, isInteractive: true })
  seen.status.length = 0
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })

  expect(seen.status).toEqual(['📱 3'])
})

function abovePrompt(surface: 'terminal' | 'desktop') {
  return {
    plugin: 'psst',
    surface,
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  } as const
}

test('the desktop band shows one icon per app, newest first, and no text', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  capture(on)
  await $.session.start({ cwd: 'C:/work', surface: null, isInteractive: true })

  const ui = await $.ui.mount(abovePrompt('desktop'))
  const icons = await ui.findAll({ type: 'Svg' })
  // FoodNow is the newest; News has no icon in phoneapps.db, so its name stands in.
  expect(icons.map(i => i.props.alt)).toEqual(['FoodNow', 'Mail'])
  expect(String(icons[0]?.props.source)).toContain('data:image/png;base64,iVBORw0KGgo')
  expect(await ui.find({ type: 'Text', text: 'News' })).toBeDefined()
  expect(await ui.find({ text: /Arriving in 12 min/ })).toBeUndefined()
  expect(icons.some(i => i.props.alt === 'Chat')).toBe(false) // dismissed
  await ui.unmount()
})

test('the band draws nothing on the terminal or when the phone has no notifications', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL, version: 1 }
  phoneLinkDisk(on, wal)
  capture(on)
  // What the engine draws in the band when no plugin does: here, an empty Box.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  await $.session.start({ cwd: 'C:/work', surface: null, isInteractive: true })

  const terminal = await $.ui.mount(abovePrompt('terminal'))
  expect(await terminal.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await terminal.find({ text: 'News' })).toBeUndefined()
  await terminal.unmount()

  wal.bytes = new Uint8Array()
  wal.version = 2
  await clock.advance(15000)
  const desktop = await $.ui.mount(abovePrompt('desktop'))
  expect(await desktop.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await desktop.find({ text: 'News' })).toBeUndefined()
  await desktop.unmount()
})

function pane(surface: 'terminal' | 'desktop') {
  return {
    plugin: 'psst',
    surface,
    component: 'Pane',
    requestId: 'psst',
    props: {
      title: 'Phone notifications',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  } as const
}

test('the pane draws one card per notification, with the app icon on the desktop', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  capture(on)
  await $.session.start({ cwd: 'C:/work', surface: null, isInteractive: true })

  const desktop = await $.ui.mount(pane('desktop'))
  const cards = await desktop.findAll({ type: 'Box', key: undefined })
  expect(cards.filter(c => c.props.borderStyle === 'round')).toHaveLength(3)
  const icons = await desktop.findAll({ type: 'Svg' })
  expect(icons.map(i => i.props.alt)).toEqual(['FoodNow', 'Mail']) // News has no icon
  expect(await desktop.find({ text: /3 on your phone/ })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount(pane('terminal'))
  expect(await terminal.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await terminal.find({ text: /Arriving in 12 min/ })).toBeDefined()
  await terminal.unmount()
})

test('with content hidden the pane keeps the icon, the app and the time only', { options: { content: 'hide' } }, async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  capture(on)
  await $.session.start({ cwd: 'C:/work', surface: null, isInteractive: true })

  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(2)
  expect(await ui.find({ text: 'FoodNow' })).toBeDefined()
  for (const text of [/On the way/, /Arriving in 12 min/, /Ada Lovelace/, /本文の1行目/]) {
    expect(await ui.find({ text })).toBeUndefined()
  }
  await ui.unmount()
})

test('a tick that comes while a slow read runs is skipped, so nothing toasts twice', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL.slice(0, WAL_BEFORE_LENGTH), version: 1 }
  // Once armed, every read of the log waits until the test lets it go.
  let gate: Promise<void> | undefined
  let release = () => {}
  phoneLinkDisk(on, wal, async path => {
    if (gate && path.endsWith('notifications.db-wal')) await gate
  })
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  await runPhone($, 'notices on')

  gate = new Promise<void>(resolve => (release = resolve))
  wal.bytes = WAL
  wal.version = 2
  await clock.advance(5000) // starts a poll that blocks on the read
  await clock.advance(5000) // a second tick while the first is still reading
  release()
  await clock.advance(5000)

  expect(seen.toasts).toEqual(['📱 FoodNow · On the way — Arriving in 12 min'])
})

test('an app with no icon does not make every change read the icons again', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  const wal: { bytes: Uint8Array; version: number } = { bytes: WAL.slice(0, WAL_BEFORE_LENGTH), version: 1 }
  const appReads: string[] = []
  phoneLinkDisk(on, wal, path => {
    if (path.includes('phoneapps.db')) appReads.push(path)
  })
  capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  expect(appReads).toHaveLength(1) // read once at start; News has no icon there

  wal.bytes = WAL
  wal.version = 2 // the log changes, and so does phoneapps.db's mtime on this disk
  await clock.advance(5000)
  expect(appReads).toHaveLength(1)
})

test('says so when Phone Link has no notifications table any more', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  const clock = mock.clock(on, { now: 1791273500000 })
  // phoneapps.db stands in for a notifications.db whose form has changed.
  const files: Record<string, Uint8Array> = { [`${DIR}\\notifications.db`]: APPS, [`${DIR}\\phoneapps.db`]: APPS }
  on('fs.exists', ($, e) => ({ value: e.path === INDEXED || e.path in files }))
  on('fs.list', () => ({ value: [{ name: 'phone-1', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  let version = 1
  on('fs.stat', ($, e) => {
    const b = files[e.path]
    if (!b) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return { value: { kind: 'file', size: b.length, mtimeMs: version, isLink: false } }
  })
  on('fs.read', ($, e) => ({ value: { base64: toBase64(files[e.path] ?? new Uint8Array()) } }))
  const seen = capture(on)

  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })
  expect(seen.status.at(-1)).not.toContain('storage has changed') // a torn read gets two more looks
  for (const v of [2, 3]) {
    version = v
    await clock.advance(5000)
  }
  expect(seen.status.at(-1)).toContain('Phone Link storage has changed')
})

test('with content hidden no sender or text is kept where other mods can read it', { options: { content: 'hide' } }, async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  capture(on)
  // Every value the mod writes to session state, as another mod could read it.
  const writes: unknown[] = []
  on('state.set', ($, e, next) => {
    writes.push(e)
    return next(e)
  })
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  const kept = JSON.stringify(writes)
  expect(kept).toContain('FoodNow') // the app is kept
  for (const text of ['On the way', 'Arriving in 12 min', 'Ada Lovelace', 'テスト通知', 'Long read']) {
    expect(kept).not.toContain(text)
  }
})

test('the pane says what it left out and why; the count and band leave it out too', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: null, isInteractive: true })

  expect(seen.status.at(-1)).toBe('📱 3') // the playback controls are not counted
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: /1 not shown: 1 playback or ongoing\. To change this, ask Claude to change psst's settings\./ })).toBeDefined()
  expect(await ui.find({ text: /A song/ })).toBeUndefined()
  await ui.unmount()
  const band = await $.ui.mount(abovePrompt('desktop'))
  expect((await band.findAll({ type: 'Svg' })).map(i => i.props.alt)).toEqual(['FoodNow', 'Mail'])
  await band.unmount()
})

test('with ongoing set to show, playback controls count like any other notification', { options: { ongoing: 'show' } }, async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  phoneLinkDisk(on, { bytes: WAL, version: 1 })
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: null, isInteractive: true })

  expect(seen.status.at(-1)).toBe('📱 4')
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: /A song/ })).toBeDefined()
  expect(await ui.find({ text: /not shown/ })).toBeUndefined()
  await ui.unmount()
})

test('a notifications file over the read limit says so, apart from an oversized log', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  // The main file reports a size past 4 MiB; the log is small.
  const big = 5 * 1024 * 1024
  phoneLinkDisk(on, { bytes: WAL, version: 1 }, () => {}, (path, size) => (path.endsWith('notifications.db') ? big : size))
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  expect(seen.status.at(-1)).toContain('notifications file is over 4 MB')
  expect(seen.status.at(-1)).not.toContain('log')
})

test('an oversized log says to quit Phone Link and open it again', async ($, on) => {
  mock.env(on, { LOCALAPPDATA: LOCAL })
  mock.clock(on, { now: 1791273500000 })
  const big = 5 * 1024 * 1024
  phoneLinkDisk(on, { bytes: WAL, version: 1 }, () => {}, (path, size) => (path.endsWith('notifications.db-wal') ? big : size))
  const seen = capture(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true })

  expect(seen.status.at(-1)).toContain('log is over 4 MB')
  expect(seen.status.at(-1)).toContain('quit Phone Link and open it again')
})

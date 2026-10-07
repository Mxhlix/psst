// The phone apps' own icons, as Phone Link copies them to this PC, and the row
// of them the desktop app shows above the prompt.

import type { Notice } from '../types'
import { toBase64 } from './base64'
import type { SqlRow } from './sqlite'

export const ICON_PX = 24
const MAX_ICONS = 12
const PNG = [0x89, 0x50, 0x4e, 0x47]
// An Svg's source may be at most 131072 characters; leave room for the markup.
const MAX_PNG_BASE64 = 130000

// Columns of Phone Link's "phone_apps" table: app_id, app_name, package_name,
// version, etag, favorite_rank, blob (the icon, a PNG), ...
export function iconsOf(rows: SqlRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of rows) {
    const pkg = row.values[2]
    const blob = row.values[6]
    if (typeof pkg !== 'string' || !(blob instanceof Uint8Array)) continue
    if (!PNG.every((b, i) => blob[i] === b)) continue
    const base64 = toBase64(blob)
    if (base64.length > MAX_PNG_BASE64) continue
    out.set(pkg, iconSvg(base64))
  }
  return out
}

function iconSvg(pngBase64: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" ` +
    `viewBox="0 0 ${ICON_PX} ${ICON_PX}"><image width="${ICON_PX}" height="${ICON_PX}" ` +
    `preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${pngBase64}"/></svg>`
  )
}

// One entry per app with a notification on the phone, the app of the newest
// first (notices come sorted newest first).
export function bandApps(notices: Notice[]): { packageName: string; app: string }[] {
  const seen = new Set<string>()
  const out: { packageName: string; app: string }[] = []
  for (const n of notices) {
    if (seen.has(n.packageName)) continue
    seen.add(n.packageName)
    out.push({ packageName: n.packageName, app: n.app })
  }
  return out.slice(0, MAX_ICONS)
}

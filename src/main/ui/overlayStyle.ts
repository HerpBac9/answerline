import type { BrowserWindow } from 'electron'

/**
 * Ask the operating system to leave this window out of screen captures.
 *
 * BEST EFFORT, and it must be treated that way. On Windows Electron maps this to
 * SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE). On macOS, recent
 * ScreenCaptureKit clients can still capture the window even when this flag is
 * enabled. Different meeting apps capture in different ways, and some paths
 * (notably certain hardware-accelerated or driver-level capture) ignore it.
 *
 * So this is never a promise of invisibility. It must be verified against each
 * app you actually use - Zoom, Teams, Meet, Discord, OBS - and the UI must show
 * whether it is on rather than implying it works everywhere.
 */
export function applyExcludeFromCapture(window: BrowserWindow, enabled: boolean): boolean {
  try {
    window.setContentProtection(enabled)
    return true
  } catch (error) {
    console.error(`Could not change capture exclusion: ${String(error)}`)
    return false
  }
}

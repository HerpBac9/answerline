import { globalShortcut } from 'electron'
import { loadConfig } from '../core/config'
import { createLogger } from '../core/log'

const log = createLogger('Hotkeys')

export interface HotkeyActions {
  onToggleWindow: () => void
  onTogglePause: () => void
  onAskLastUtterance: () => void
}

/**
 * Global shortcuts, so the app is reachable while the meeting window has focus.
 *
 * Registration failures are reported rather than swallowed: another app holding
 * the same combination is common, and a silently dead hotkey during an interview
 * is worse than knowing at startup.
 */
export function registerHotkeys(actions: HotkeyActions): string[] {
  const { hotkeys } = loadConfig()
  const failed: string[] = []

  const bindings: Array<[string, () => void]> = [
    [hotkeys.toggleWindow, actions.onToggleWindow],
    [hotkeys.togglePause, actions.onTogglePause],
    [hotkeys.askLastUtterance, actions.onAskLastUtterance],
  ]

  for (const [accelerator, handler] of bindings) {
    if (!accelerator) continue
    try {
      if (globalShortcut.register(accelerator, handler)) log.info(`Registered ${accelerator}`)
      else failed.push(accelerator)
    } catch (error) {
      log.warn(`Could not register ${accelerator}:`, error)
      failed.push(accelerator)
    }
  }

  return failed
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}

/**
 * Report which global shortcuts are actually available on THIS machine.
 *
 * Global hotkey registration fails silently when another process already owns
 * the combination, and a dead hotkey mid-interview is exactly the kind of failure
 * that is discovered at the worst moment. Measured on a stock Windows box with two
 * keyboard layouts: Control+Shift+Space and Control+Alt+Space are both taken by
 * the input-method switcher.
 *
 * Also prints whether the combinations currently in config.json are free.
 *
 *   npm run hotkeys
 */
const { app, globalShortcut } = require('electron')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { homedir } = require('node:os')

const CANDIDATES = [
  'CommandOrControl+Shift+\\', 'CommandOrControl+Shift+P', 'CommandOrControl+Shift+Enter',
  'CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space', 'Alt+Space', 'CommandOrControl+Space',
  'CommandOrControl+Alt+W', 'CommandOrControl+Alt+A', 'CommandOrControl+Alt+Q',
  'CommandOrControl+Shift+J', 'CommandOrControl+Shift+K', 'F8', 'CommandOrControl+Shift+F8',
]

function configuredHotkeys() {
  const path = process.env.ANSWERLINE_CONFIG_PATH
    || (process.platform === 'win32'
      ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'answerline', 'config.json')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'answerline', 'config.json')
        : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'answerline', 'config.json'))
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')).hotkeys ?? null
  } catch {
    return null
  }
}

function isFree(accelerator) {
  let free = false
  try {
    free = globalShortcut.register(accelerator, () => {})
  } catch {
    free = false
  }
  if (free) globalShortcut.unregister(accelerator)
  return free
}

app.whenReady().then(() => {
  const configured = configuredHotkeys()

  if (configured) {
    console.log('\nYour configured hotkeys')
    for (const [action, accelerator] of Object.entries(configured)) {
      if (!accelerator) continue
      console.log(`  ${isFree(accelerator) ? 'free ' : 'TAKEN'}  ${action.padEnd(18)} ${accelerator}`)
    }
  } else {
    console.log('\nNo config.json yet - run the app once, or use the platform defaults from src/main/core/config.ts')
  }

  console.log('\nCommon combinations')
  for (const accelerator of CANDIDATES) {
    console.log(`  ${isFree(accelerator) ? 'free ' : 'TAKEN'}  ${accelerator}`)
  }

  console.log('\nPut a free combination into hotkeys in config.json and restart.\n')
  app.quit()
})

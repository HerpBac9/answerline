import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { loadConfig } from '../core/config'
import { applyExcludeFromCapture } from './overlayStyle'

/**
 * The single window: always on top, frameless and centered over the interview
 * window. The renderer supplies a translucent glass surface, so the text stays
 * readable without hiding the screen underneath it.
 *
 * One window rather than the usual dashboard + overlay pair. During an interview
 * there is nowhere to put a second window, and everything the user needs -
 * transcript, answer, a chat box - fits in one column.
 */
export function createOverlayWindow(): BrowserWindow {
  const config = loadConfig()
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(900, Math.max(480, workArea.width - 80))
  const height = Math.min(700, Math.max(420, workArea.height - 80))

  const window = new BrowserWindow({
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    // Keep the app in the Windows taskbar so the minimize button has a normal
    // restore target instead of making the window disappear completely.
    skipTaskbar: false,
    resizable: true,
    minimizable: true,
    closable: true,
    // Nothing here should ever steal focus from the meeting app mid-answer.
    focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 'screen-saver' sits above fullscreen windows, which is where a shared
  // meeting window usually is.
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (config.excludeFromCapture) applyExcludeFromCapture(window, true)

  window.once('ready-to-show', () => window.show())

  // Anything that wants a new window goes to the real browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

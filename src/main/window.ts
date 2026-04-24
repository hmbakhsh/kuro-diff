import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'docs.github.com',
  'cli.github.com',
])

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Zoom shortcuts — bound at the webContents layer instead of via menu
  // accelerators. Electron's accelerator parser handles `CmdOrCtrl+-` flakily
  // on macOS (the `-` key doesn't always bind cleanly when sharing a role with
  // other zoom items), so we catch the keystroke directly.
  const ZOOM_STEP = 0.5
  const ZOOM_MIN = -8
  const ZOOM_MAX = 9
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod || input.alt) return

    const wc = win.webContents
    if (input.key === '=' || input.key === '+') {
      wc.setZoomLevel(Math.min(wc.getZoomLevel() + ZOOM_STEP, ZOOM_MAX))
      event.preventDefault()
    } else if (input.key === '-' || input.key === '_') {
      wc.setZoomLevel(Math.max(wc.getZoomLevel() - ZOOM_STEP, ZOOM_MIN))
      event.preventDefault()
    } else if (input.key === '0') {
      wc.setZoomLevel(0)
      event.preventDefault()
    }
  })

  // Deny navigation to non-app origins.
  win.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    const isDevServer =
      is.dev && (target.protocol === 'http:' || target.protocol === 'https:')
    if (target.protocol !== 'file:' && !isDevServer) {
      event.preventDefault()
    }
  })

  // Deny window.open; delegate allowlisted hosts to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url)
      if (
        (target.protocol === 'https:' || target.protocol === 'http:') &&
        ALLOWED_EXTERNAL_HOSTS.has(target.hostname)
      ) {
        void shell.openExternal(url)
      }
    } catch {
      // fall through — just deny
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

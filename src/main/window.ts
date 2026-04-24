import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { getWindowState, setWindowState } from './services/workspace-store.js'

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'docs.github.com',
  'cli.github.com',
])

/**
 * Load persisted bounds, but reject them if the display they targeted is
 * gone (e.g. external monitor unplugged). `screen.getDisplayMatching` picks
 * whichever current display has the most overlap with the saved rectangle.
 */
async function resolveInitialBounds(): Promise<{
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}> {
  const state = await getWindowState()
  const fallback = { width: 1440, height: 900, maximized: false }
  const saved = state.bounds
  if (!saved) return fallback

  const rect = {
    x: saved.x ?? 0,
    y: saved.y ?? 0,
    width: saved.width,
    height: saved.height,
  }
  const display = screen.getDisplayMatching(rect)
  const within =
    rect.x >= display.workArea.x &&
    rect.y >= display.workArea.y &&
    rect.x + rect.width <= display.workArea.x + display.workArea.width &&
    rect.y + rect.height <= display.workArea.y + display.workArea.height
  if (!within) return fallback
  return {
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    maximized: !!state.maximized,
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const initial = await resolveInitialBounds()
  const win = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
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

  if (initial.maximized) win.maximize()

  win.on('ready-to-show', () => {
    win.show()
  })

  // Debounced bounds persistence. Electron fires resize/move continuously
  // during drags, so we throttle and only capture the final state via a
  // trailing timer. `getNormalBounds` returns the pre-maximize rectangle,
  // which is what we want to restore next launch.
  let persistTimer: NodeJS.Timeout | null = null
  const persistBounds = (): void => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      const bounds = win.getNormalBounds()
      void setWindowState({
        bounds,
        maximized: win.isMaximized(),
      })
    }, 300)
  }
  win.on('resize', persistBounds)
  win.on('move', persistBounds)
  win.on('maximize', persistBounds)
  win.on('unmaximize', persistBounds)
  win.on('close', () => {
    if (persistTimer) clearTimeout(persistTimer)
    if (win.isDestroyed()) return
    void setWindowState({
      bounds: win.getNormalBounds(),
      maximized: win.isMaximized(),
    })
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

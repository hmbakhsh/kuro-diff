import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'docs.github.com',
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

import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createIPCHandler } from 'trpc-electron/main'
import { createMainWindow } from './window.js'
import { installApplicationMenu } from './menu.js'
import { installContentSecurityPolicy, installWebContentsGuards } from './security.js'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'
import { initGitBinary } from './services/git-binary.js'
import { watcherRegistry } from './services/watcher-registry.js'

// Force the app name before `ready` so the About menu, Dock tooltip, and
// `~/Library/Application Support/<name>` all read "Kuro" in dev. In packaged
// builds electron-builder sets this via productName in the Info.plist.
app.setName('Kuro')
app.setAppUserModelId('com.kuro.diff')

// Dev mode runs Electron.app, so the Dock icon is Electron's feather unless
// we override it. Packaged builds get the icon from electron-builder.
if (is.dev && process.platform === 'darwin') {
  const devIcon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  if (!devIcon.isEmpty()) app.dock?.setIcon(devIcon)
}

let mainWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  // Install security hardening *after* ready — onHeadersReceived pre-ready
  // crashes silently (electron/electron#42000).
  installContentSecurityPolicy()
  installWebContentsGuards()

  // Resolve the login-shell PATH + git binary once at startup so subsequent
  // `spawn('git')` calls don't ENOENT. If git is missing we surface the error
  // via tRPC when the first workspace op runs — don't crash the app.
  try {
    await initGitBinary()
  } catch (err) {
    console.error('[main] git binary resolution failed:', err)
  }

  electronApp.setAppUserModelId('com.kuro.diff')

  installApplicationMenu()

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  mainWindow = await createMainWindow()

  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
    createContext: async () => createContext(),
  })

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void watcherRegistry.closeAll()
})

// Disable WebContents creation from a hijacked renderer.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault())
})

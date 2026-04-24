import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createIPCHandler } from 'trpc-electron/main'
import { createMainWindow } from './window.js'
import { installContentSecurityPolicy, installWebContentsGuards } from './security.js'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'
import { initGitBinary } from './services/git-binary.js'
import { watcherRegistry } from './services/watcher-registry.js'

// Set macOS app user model ID before any windows exist.
app.setAppUserModelId('com.kuro.diff')

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

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  mainWindow = createMainWindow()

  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
    createContext: async () => createContext(),
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
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

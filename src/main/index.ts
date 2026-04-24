import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createIPCHandler } from 'trpc-electron/main'
import { createMainWindow } from './window.js'
import { installContentSecurityPolicy, installWebContentsGuards } from './security.js'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'

// Set macOS app user model ID before any windows exist.
app.setAppUserModelId('com.kuro.diff')

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  // Install security hardening *after* ready — onHeadersReceived pre-ready
  // crashes silently (electron/electron#42000).
  installContentSecurityPolicy()
  installWebContentsGuards()

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

// Disable WebContents creation from a hijacked renderer.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault())
})

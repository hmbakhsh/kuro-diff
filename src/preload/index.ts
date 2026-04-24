import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { exposeElectronTRPC } from 'trpc-electron/main'

// Expose the typed tRPC bridge. This is the ONLY IPC surface the renderer sees.
process.once('loaded', () => {
  exposeElectronTRPC()
})

// Keep @electron-toolkit/preload's safe API available for non-IPC utilities.
// contextIsolation is on, so we must route through contextBridge.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error('[preload] contextBridge expose failed', error)
  }
}

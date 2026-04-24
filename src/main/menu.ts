import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'

export const MENU_CHANNEL = 'kuro:menu'
export type MenuCommand =
  | 'file.open-repo'
  | 'file.settings'
  | 'view.toggle-sidebar'
  | 'view.toggle-theme'
  | 'go.files'
  | 'go.diffs'
  | 'go.prs'
  | 'go.settings'
  | 'go.next-tab'
  | 'go.prev-tab'
  | 'palette.command'
  | 'palette.copy-for-agent'

function send(command: MenuCommand): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return
  win.webContents.send(MENU_CHANNEL, command)
}

function item(
  label: string,
  command: MenuCommand,
  accelerator?: string,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => send(command),
  }
}

/**
 * Zoom shortcuts are wired via `before-input-event` in window.ts rather than
 * menu accelerators — Electron's accelerator parser handles `CmdOrCtrl+-`
 * inconsistently on macOS. Menu entries stay for click access; accelerators
 * are omitted to avoid double-triggering with the input handler.
 */
export function installApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const zoomItems: MenuItemConstructorOptions[] = [
    { role: 'resetZoom', label: 'Actual Size' },
    { role: 'zoomIn', label: 'Zoom In' },
    { role: 'zoomOut', label: 'Zoom Out' },
  ]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              item('Settings…', 'file.settings', 'Cmd+,'),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('Open Repo…', 'file.open-repo', 'CmdOrCtrl+O'),
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Copy for Agent…', 'palette.copy-for-agent', 'CmdOrCtrl+Shift+C'),
        item('Command Palette…', 'palette.command', 'CmdOrCtrl+P'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Toggle Sidebar', 'view.toggle-sidebar', 'CmdOrCtrl+\\'),
        item('Cycle Theme', 'view.toggle-theme'),
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        ...zoomItems,
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        item('Files', 'go.files', 'CmdOrCtrl+1'),
        item('Diffs', 'go.diffs', 'CmdOrCtrl+2'),
        item('Pull Requests', 'go.prs', 'CmdOrCtrl+3'),
        item('Settings', 'go.settings'),
        { type: 'separator' },
        item('Previous Tab', 'go.prev-tab', 'CmdOrCtrl+Shift+['),
        item('Next Tab', 'go.next-tab', 'CmdOrCtrl+Shift+]'),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'front' } as MenuItemConstructorOptions,
            ]
          : [{ role: 'close' } as MenuItemConstructorOptions]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub CLI Manual',
          click: () => {
            void shell.openExternal('https://cli.github.com/manual/')
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

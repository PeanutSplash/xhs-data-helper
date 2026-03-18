import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/icon.png?asset'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'
import { registerAppHandlers } from '@/lib/conveyor/handlers/app-handler'
import { registerSpiderHandlers } from '@/lib/conveyor/handlers/spider-handler'
import { registerUpdateHandlers } from '@/lib/conveyor/handlers/update-handler'
import { updateManager } from '@/lib/main/updater/update-manager'
import { databaseManager } from '@/lib/main/spider/database-manager'

export function createAppWindow(): void {
  // Fix any stuck tasks/queue items from previous session
  const fixedCount = databaseManager.fixStuckTasks()
  if (fixedCount > 0) {
    console.log(`Fixed ${fixedCount} stuck tasks from previous session`)
  }
  const fixedQueueCount = databaseManager.fixStuckQueueItems()
  if (fixedQueueCount > 0) {
    console.log(`Fixed ${fixedQueueCount} stuck queue items from previous session`)
  }

  // Create the main window.
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 870,
    show: false,
    backgroundColor: '#1c1c1c',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'Spider XHS',
    maximizable: true,
    resizable: true,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  })

  // Register IPC events for the main window.
  registerWindowHandlers(mainWindow)
  registerAppHandlers(app)
  registerSpiderHandlers(mainWindow)
  registerUpdateHandlers()

  // Initialize update manager
  updateManager.init(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()

    // Auto open DevTools in development mode
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

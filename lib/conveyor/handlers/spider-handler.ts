import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { configManager } from '@/lib/main/spider/config-manager'
import { pythonBridge, SpiderConfig } from '@/lib/main/spider/python-bridge'
import { databaseManager } from '@/lib/main/spider/database-manager'
import { queueManager } from '@/lib/main/spider/queue-manager'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import appIcon from '@/resources/build/icon.png?asset'

export function registerSpiderHandlers(mainWindow: BrowserWindow | null) {
  // Set main window for queue manager
  if (mainWindow) {
    queueManager.setMainWindow(mainWindow)
  }

  // Config management
  ipcMain.handle('spider:config:getAll', async () => {
    return configManager.getAll()
  })

  ipcMain.handle(
    'spider:config:setCookie',
    async (_event, cookie: string, validUntil?: number) => {
      configManager.setCookie(cookie, validUntil)
      return { success: true }
    }
  )

  ipcMain.handle('spider:config:getCookie', async () => {
    return configManager.getCookie()
  })

  ipcMain.handle('spider:config:isCookieValid', async () => {
    return configManager.isCookieValid()
  })

  ipcMain.handle('spider:config:validateCookie', async (_event, cookie: string) => {
    try {
      const result = await pythonBridge.validateCookie(cookie)
      return result
    } catch (error: any) {
      return {
        valid: false,
        message: error.message || 'Validation failed',
        userInfo: null,
      }
    }
  })

  ipcMain.handle('spider:webview:login', async () => {
    return await openLoginWindow()
  })

  ipcMain.handle('spider:config:setPaths', async (_event, paths: any) => {
    configManager.setPaths(paths)
    return { success: true }
  })

  ipcMain.handle('spider:config:setProxy', async (_event, proxy: any) => {
    configManager.setProxy(proxy)
    return { success: true }
  })

  ipcMain.handle('spider:config:setLastTask', async (_event, type: string, params: any) => {
    configManager.setLastTask(type, params)
    return { success: true }
  })

  // File dialogs
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('dialog:openFolder', async (_event, path: string) => {
    try {
      const error = await shell.openPath(path)
      if (error) {
        return { success: false, error }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Spider task management
  ipcMain.handle('spider:start', async (_event, config: SpiderConfig) => {
    try {
      await pythonBridge.start(config, (message) => {
        // Forward Python messages to renderer
        if (mainWindow) {
          mainWindow.webContents.send('spider:message', message)
        } else {
          console.warn('mainWindow is null, cannot send message')
        }
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('spider:stop', async () => {
    pythonBridge.stop()
    return { success: true }
  })

  ipcMain.handle('spider:isRunning', async () => {
    return pythonBridge.isRunning()
  })

  // History management
  ipcMain.handle('spider:history:getCurrentTask', async () => {
    const taskId = pythonBridge.getCurrentTaskId()
    if (taskId) {
      return databaseManager.getTask(taskId)
    }
    return databaseManager.getCurrentTask()
  })

  ipcMain.handle('spider:history:getTaskLogs', async (_event, taskId: number) => {
    return databaseManager.getTaskLogs(taskId)
  })

  ipcMain.handle('spider:history:getRecentTasks', async (_event, limit?: number) => {
    return databaseManager.getRecentTasks(limit)
  })

  ipcMain.handle('spider:history:deleteTask', async (_event, taskId: number) => {
    databaseManager.deleteTask(taskId)
    return { success: true }
  })

  // File operations
  ipcMain.handle('spider:file:readExcel', async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }

      const workbook = XLSX.readFile(filePath)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      return { success: true, data: jsonData, sheetName }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Queue Management
  ipcMain.handle('spider:queue:add', async (_event, taskConfig: any, priority?: number) => {
    try {
      const queueId = queueManager.addToQueue(taskConfig, priority)
      return { success: true, queueId }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('spider:queue:start', async () => {
    try {
      return await queueManager.startQueue()
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('spider:queue:stop', async () => {
    try {
      return await queueManager.stopQueue()
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('spider:queue:getItems', async (_event, status?: string) => {
    try {
      return queueManager.getQueueItems(status as any)
    } catch (error: any) {
      return []
    }
  })

  ipcMain.handle('spider:queue:getStats', async () => {
    try {
      return queueManager.getStats()
    } catch (error: any) {
      return { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }
    }
  })

  ipcMain.handle('spider:queue:getStatus', async () => {
    try {
      return {
        status: queueManager.getStatus(),
        currentItem: queueManager.getCurrentQueueItem(),
        stats: queueManager.getStats()
      }
    } catch (error: any) {
      return {
        status: 'idle',
        currentItem: null,
        stats: { pending: 0, running: 0, completed: 0, failed: 0, total: 0 }
      }
    }
  })

  ipcMain.handle('spider:queue:remove', async (_event, queueId: number) => {
    try {
      queueManager.removeFromQueue(queueId)
      return { success: true }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('spider:queue:updatePriority', async (_event, queueId: number, priority: number) => {
    try {
      queueManager.updatePriority(queueId, priority)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('spider:queue:clearCompleted', async () => {
    try {
      queueManager.clearCompleted()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

async function openLoginWindow(): Promise<{ success: boolean; cookie?: string; error?: string }> {
  return new Promise((resolve) => {
    const loginWindow = new BrowserWindow({
      width: 500,
      height: 700,
      title: '登录小红书',
      icon: appIcon,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
      },
    })

    loginWindow.loadURL('https://www.xiaohongshu.com/login')

    // 监听 URL 变化，检测是否重定向到 /explore（表示登录成功）
    loginWindow.webContents.on('did-navigate', async (_event, url) => {
      if (url.includes('/explore')) {
        // 登录成功，重定向到了 explore 页面
        try {
          const cookies = await loginWindow.webContents.session.cookies.get({
            domain: '.xiaohongshu.com',
          })
          const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
          loginWindow.close()
          resolve({ success: true, cookie: cookieString })
        } catch (error: any) {
          console.error('Error extracting cookies:', error)
          loginWindow.close()
          resolve({ success: false, error: '提取 Cookie 失败' })
        }
      }
    })

    // 同时监听 did-redirect-navigation（处理重定向）
    loginWindow.webContents.on('did-redirect-navigation', async (_event, url) => {
      if (url.includes('/explore')) {
        try {
          const cookies = await loginWindow.webContents.session.cookies.get({
            domain: '.xiaohongshu.com',
          })
          const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
          loginWindow.close()
          resolve({ success: true, cookie: cookieString })
        } catch (error: any) {
          console.error('Error extracting cookies:', error)
          loginWindow.close()
          resolve({ success: false, error: '提取 Cookie 失败' })
        }
      }
    })

    // 处理用户手动关闭窗口
    loginWindow.on('closed', () => {
      resolve({ success: false, error: '用户关闭了登录窗口' })
    })
  })
}

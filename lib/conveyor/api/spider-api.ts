import type { ElectronAPI } from '@electron-toolkit/preload'
import { SpiderConfig, Config, PythonMessage, QueueItem, QueueTaskConfig, QueueStatus } from '../schemas/spider-schema'

export interface Task {
  id: number
  task_type: string
  params: string
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'warning'
  started_at: number
  completed_at: number | null
  error_message: string | null
  result_count: number
  config: string | null
}

export interface Log {
  id: number
  task_id: number
  type: string
  level: string | null
  message: string
  timestamp: number
  metadata: string | null
}

export class SpiderApi {
  constructor(private electronAPI: ElectronAPI) {}

  // Config Management
  getConfig = (): Promise<Config> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:getAll')
  }

  setCookie = (cookie: string, validUntil?: number): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:setCookie', cookie, validUntil)
  }

  getCookie = (): Promise<string> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:getCookie')
  }

  isCookieValid = (): Promise<boolean> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:isCookieValid')
  }

  validateCookie = (
    cookie: string
  ): Promise<{
    valid: boolean
    message: string
    userInfo?: {
      userId: string
      nickname: string
      redId: string
      avatar: string
    } | null
  }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:validateCookie', cookie)
  }

  webviewLogin = (): Promise<{ success: boolean; cookie?: string; error?: string }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:webview:login')
  }

  setPaths = (paths: { media?: string; excel?: string }): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:setPaths', paths)
  }

  setProxy = (proxy: { enabled?: boolean; url?: string }): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:setProxy', proxy)
  }

  setRequestDelay = (delayMs: number): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:setRequestDelay', delayMs)
  }

  setLastTask = (type: string, params: any): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:config:setLastTask', type, params)
  }

  // Spider Task Management
  startTask = (config: SpiderConfig): Promise<{ success: boolean; error?: string }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:start', config)
  }

  stopTask = (): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:stop')
  }

  isRunning = (): Promise<boolean> => {
    return this.electronAPI.ipcRenderer.invoke('spider:isRunning')
  }

  // Listen to spider messages
  onMessage = (callback: (message: PythonMessage) => void): (() => void) => {
    const unsubscribe = this.electronAPI.ipcRenderer.on(
      'spider:message',
      (_event, message: PythonMessage) => {
        callback(message)
      }
    )
    return unsubscribe
  }

  // Listen to cookie invalid events
  onCookieInvalid = (callback: (data: { message: string }) => void): (() => void) => {
    const unsubscribe = this.electronAPI.ipcRenderer.on(
      'cookie:invalid',
      (_event, data: { message: string }) => {
        callback(data)
      }
    )
    return unsubscribe
  }

  // Dialog
  selectDirectory = (): Promise<string | null> => {
    return this.electronAPI.ipcRenderer.invoke('dialog:selectDirectory')
  }

  openFolder = (path: string): Promise<{ success: boolean; error?: string }> => {
    return this.electronAPI.ipcRenderer.invoke('dialog:openFolder', path)
  }

  // History Management
  getCurrentTask = (): Promise<Task | null> => {
    return this.electronAPI.ipcRenderer.invoke('spider:history:getCurrentTask')
  }

  getTaskLogs = (taskId: number): Promise<Log[]> => {
    return this.electronAPI.ipcRenderer.invoke('spider:history:getTaskLogs', taskId)
  }

  getRecentTasks = (limit?: number): Promise<Task[]> => {
    return this.electronAPI.ipcRenderer.invoke('spider:history:getRecentTasks', limit)
  }

  deleteTask = (taskId: number): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:history:deleteTask', taskId)
  }

  // File operations
  readExcelFile = (filePath: string): Promise<{ success: boolean; data?: any[][]; sheetName?: string; error?: string }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:file:readExcel', filePath)
  }

  // Queue Management
  addToQueue = (taskConfig: QueueTaskConfig, priority?: number): Promise<{ success: boolean; queueId: number }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:add', taskConfig, priority)
  }

  startQueue = (): Promise<{ success: boolean; message: string }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:start')
  }

  stopQueue = (): Promise<{ success: boolean; message: string }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:stop')
  }

  getQueueItems = (status?: QueueItem['status']): Promise<QueueItem[]> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:getItems', status)
  }

  getQueueStats = (): Promise<{ pending: number; running: number; completed: number; failed: number; total: number }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:getStats')
  }

  getQueueStatus = (): Promise<QueueStatus> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:getStatus')
  }

  removeFromQueue = (queueId: number): Promise<{ success: boolean; message?: string }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:remove', queueId)
  }

  updateQueuePriority = (queueId: number, priority: number): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:updatePriority', queueId, priority)
  }

  clearCompletedQueue = (): Promise<{ success: boolean }> => {
    return this.electronAPI.ipcRenderer.invoke('spider:queue:clearCompleted')
  }

  // Listen to queue status updates
  onQueueStatus = (callback: (status: QueueStatus) => void): (() => void) => {
    const unsubscribe = this.electronAPI.ipcRenderer.on(
      'spider:queue:status',
      (_event, status: QueueStatus) => {
        callback(status)
      }
    )
    return unsubscribe
  }
}

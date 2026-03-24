/**
 * Python Bridge Module
 * Manages Python subprocess for Spider XHS
 */
import { spawn, execSync, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app, BrowserWindow } from 'electron'
import { databaseManager } from './database-manager'
import { configManager } from './config-manager'

export interface SpiderConfig {
  cookie: string
  taskType: 'notes' | 'user' | 'search'
  params: Record<string, any>
  saveOptions: {
    mode: 'excel' | 'media' | 'all'
    excelName?: string
  }
  paths: {
    media: string
    excel: string
  }
  proxy?: string
}

export interface PythonMessage {
  type: 'log' | 'progress' | 'media' | 'done' | 'error' | 'validation_result'
  level?: 'INFO' | 'WARNING' | 'ERROR'
  message?: string
  current?: number
  total?: number
  title?: string
  noteId?: string
  action?: string
  file?: string
  progress?: number
  success?: boolean
  count?: number
  files?: string[]
  code?: string
  valid?: boolean
  api_success?: boolean
  api_message?: string
  userInfo?: {
    userId: string
    nickname: string
    redId: string
    avatar: string
  } | null
}

export type MessageHandler = (message: PythonMessage) => void

export class PythonBridge {
  private process: ChildProcess | null = null
  private messageHandler: MessageHandler | null = null
  private currentTaskId: number | null = null
  private taskStatusSet: boolean = false // Track if status was set by done message
  private mainWindow: BrowserWindow | null = null

  constructor() {}

  /**
   * Set main window reference for sending notifications
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * Validate cookie and notify renderer
   */
  private async validateCookieAndNotify(): Promise<void> {
    try {
      const cookie = configManager.getCookie()
      if (!cookie) {
        console.log('No cookie to validate')
        return
      }

      console.log('Validating cookie due to account anomaly...')
      const result = await this.validateCookie(cookie)

      if (!result.valid) {
        console.log('Cookie validation failed:', result.message)
        // Update cookie validity in config
        configManager.setCookie(cookie, 0) // Mark as expired

        // Notify renderer process
        if (this.mainWindow) {
          this.mainWindow.webContents.send('cookie:invalid', {
            message: result.message
          })
        }
      } else {
        console.log('Cookie is still valid')
      }
    } catch (error) {
      console.error('Error validating cookie:', error)
    }
  }

  /**
   * Get Python executable path
   * In production, use bundled Python from resources
   * In development, use system Python
   */
  private getPythonPath(): string {
    if (app.isPackaged) {
      const pythonDir = path.join(process.resourcesPath, 'python')
      const pythonBin = process.platform === 'win32'
        ? path.join(pythonDir, 'python.exe')
        : path.join(pythonDir, 'bin', 'python3')

      // Verify bundled Python exists
      if (!fs.existsSync(pythonBin)) {
        throw new Error(`Bundled Python not found at ${pythonBin}`)
      }

      return pythonBin
    }

    // Development: resolve absolute path to avoid shell/PATH issues with spawn
    const cmd = process.platform === 'win32' ? 'python' : 'python3'
    try {
      return execSync(`${cmd} -c "import sys; print(sys.executable)"`, { encoding: 'utf-8' }).trim()
    } catch {
      return cmd
    }
  }

  /**
   * Get Python CLI script path
   */
  private getCliPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'python-engine', 'cli.py')
    }
    // In development, use submodule
    return path.join(app.getAppPath(), 'python-engine', 'cli.py')
  }

  /**
   * Get Node.js modules path for PyExecJS
   * PyExecJS needs NODE_PATH to locate node_modules (like crypto-js)
   */
  private getNodeModulesPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'python-engine', 'node_modules')
    }
    // In development
    return path.join(app.getAppPath(), 'python-engine', 'node_modules')
  }

  /**
   * Get Python packages directory path
   * In production, packages are pre-installed with Python
   * In development, use system packages
   */
  private getPackagesPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'python-packages')
    }
    // Development: no extra packages path needed
    return ''
  }

  /**
   * Ensure a `node` shim exists that delegates to Electron's built-in Node.js
   * via ELECTRON_RUN_AS_NODE=1, so PyExecJS can use it without requiring
   * a separate Node.js installation on the user's machine.
   */
  private nodeShimDir: string | null = null
  private ensureNodeShim(): string {
    if (this.nodeShimDir) return this.nodeShimDir

    const shimDir = path.join(app.getPath('temp'), 'xhs-helper-node-shim')
    fs.mkdirSync(shimDir, { recursive: true })

    if (process.platform === 'win32') {
      // On Windows, execjs uses subprocess.Popen(["node", ...]) which calls
      // CreateProcess API — it can only execute .exe/.com files, NOT .cmd/.bat.
      // So we must create a node.exe hard link pointing to the Electron binary.
      // ELECTRON_RUN_AS_NODE=1 is set in buildPythonEnv() to make it behave as Node.js.
      const electronDir = path.dirname(process.execPath)
      const shimPath = path.join(shimDir, 'node.exe')

      // Helper: link or copy a file into the shim directory
      const ensureFile = (srcName: string, destName?: string): void => {
        const src = path.join(electronDir, srcName)
        const dest = path.join(shimDir, destName || srcName)
        if (!fs.existsSync(src)) return
        try {
          if (fs.existsSync(dest)) {
            const destStat = fs.statSync(dest)
            const srcStat = fs.statSync(src)
            if (destStat.ino === srcStat.ino || destStat.size === srcStat.size) return // already up to date
            fs.unlinkSync(dest)
          }
          fs.linkSync(src, dest)
        } catch {
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest)
            fs.copyFileSync(src, dest)
          } catch (e) {
            console.error(`Failed to create shim for ${srcName}:`, e)
          }
        }
      }

      // Link the Electron binary as node.exe
      ensureFile(path.basename(process.execPath), 'node.exe')
      // Electron-as-Node still requires ICU data for internationalization,
      // even with ELECTRON_RUN_AS_NODE=1. Without it: "Invalid file descriptor to ICU data received"
      ensureFile('icudtl.dat')
      // v8 snapshots may also be needed for fast startup
      ensureFile('v8_context_snapshot.bin')
      ensureFile('snapshot_blob.bin')
    } else {
      const shimPath = path.join(shimDir, 'node')
      const shimContent = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`
      const existing = fs.existsSync(shimPath) ? fs.readFileSync(shimPath, 'utf-8') : ''
      if (existing !== shimContent) {
        fs.writeFileSync(shimPath, shimContent, { mode: 0o755 })
      }
    }

    this.nodeShimDir = shimDir
    return shimDir
  }

  /**
   * Build environment variables for Python subprocess
   */
  private buildPythonEnv(): NodeJS.ProcessEnv {
    const packagesPath = this.getPackagesPath()
    const nodeModulesPath = this.getNodeModulesPath()
    const nodeShimDir = this.ensureNodeShim()

    const nodeExePath = process.platform === 'win32'
      ? path.join(nodeShimDir, 'node.exe')
      : path.join(nodeShimDir, 'node')

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_PATH: nodeModulesPath,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      EXECJS_RUNTIME: 'Node',
      // Required for the node.exe hard link (which is actually Electron) to run as Node.js
      ELECTRON_RUN_AS_NODE: '1',
      // Explicit path to our node binary — do NOT rely on PATH lookup,
      // which could resolve to nvm/volta/system Node instead of Electron's.
      NODE_BINARY: nodeExePath,
      // Still prepend shim dir to PATH as a fallback
      PATH: `${nodeShimDir}${path.delimiter}${process.env.PATH || ''}`,
    }

    if (packagesPath) {
      env.PYTHONPATH = packagesPath
    }

    return env
  }

  /**
   * Start spider task
   */
  async start(config: SpiderConfig, onMessage: MessageHandler): Promise<void> {
    if (this.process) {
      throw new Error('Task already running')
    }

    this.messageHandler = onMessage

    // Reset status flag for new task
    this.taskStatusSet = false

    // Create task record in database
    this.currentTaskId = databaseManager.createTask(config.taskType, config.params, {
      saveOptions: config.saveOptions,
      paths: config.paths,
      proxy: config.proxy,
    })

    const pythonPath = this.getPythonPath()
    const cliPath = this.getCliPath()
    const configJson = JSON.stringify(config)
    const env = this.buildPythonEnv()

    this.process = spawn(pythonPath, [cliPath, configJson], {
      cwd: path.dirname(cliPath), // Set working directory to python-engine folder
      env,
    })

    // Handle stdout (JSON Lines)
    this.process.stdout?.on('data', (data) => {
      const rawOutput = data.toString()

      // Log all raw output to console for debugging
      console.log('[Python stdout]:', rawOutput)

      const lines = rawOutput.split('\n')
      lines.forEach((line: string) => {
        if (line.trim()) {
          try {
            const message: PythonMessage = JSON.parse(line)

            // Save to database
            if (this.currentTaskId) {
              databaseManager.addLog(this.currentTaskId, message)

              // Handle done message to determine final status
              if (message.type === 'done') {
                const count = message.count || 0
                const apiSuccess = message.api_success ?? true
                const apiMessage = message.api_message || ''

                // Determine task status based on result count and API response
                let status: 'completed' | 'warning' | 'failed' = 'completed'
                let errorMsg: string | undefined

                // Check for account anomaly
                if (!apiSuccess || apiMessage.includes('账号异常') || apiMessage.includes('检测到账号异常') || apiMessage.includes('code=-1')) {
                  status = 'failed'
                  errorMsg = apiMessage || '账号异常，请重新登录'

                  // Trigger cookie validation
                  this.validateCookieAndNotify().catch(err => {
                    console.error('Failed to validate cookie:', err)
                  })
                } else if (count === 0) {
                  // No data but no error - mark as warning
                  status = 'warning'
                  errorMsg = '任务完成但未获取到任何数据'
                }

                databaseManager.updateTask(this.currentTaskId, status, errorMsg, count)
                this.taskStatusSet = true // Mark that status has been set
              }
            }

            this.messageHandler?.(message)
          } catch (error) {
            // Not a JSON line, log as raw output
            console.log('[Python non-JSON]:', line)
          }
        }
      })
    })

    // Handle stderr
    this.process.stderr?.on('data', (data) => {
      const stderrOutput = data.toString()
      console.error('[Python stderr]:', stderrOutput)
      const errorMessage: PythonMessage = {
        type: 'error',
        message: data.toString(),
      }

      // Save to database
      if (this.currentTaskId) {
        databaseManager.addLog(this.currentTaskId, errorMessage)
      }

      this.messageHandler?.(errorMessage)
    })

    // Handle process exit
    this.process.on('close', (code) => {
      // Update task status in database only if not already set by done message
      if (this.currentTaskId && !this.taskStatusSet) {
        if (code === 0) {
          databaseManager.updateTask(this.currentTaskId, 'completed')
        } else if (code !== null) {
          databaseManager.updateTask(
            this.currentTaskId,
            'failed',
            `Process exited with code ${code}`
          )
        }
      }

      this.process = null
      this.currentTaskId = null
      this.taskStatusSet = false // Reset flag

      if (code !== 0 && code !== null) {
        this.messageHandler?.({
          type: 'error',
          code: 'PROCESS_EXIT',
          message: `Process exited with code ${code}`,
        })
      }
    })

    // Handle process error
    this.process.on('error', (error) => {
      console.error('Python process error:', error)

      const errorMessage: PythonMessage = {
        type: 'error',
        code: 'PROCESS_ERROR',
        message: error.message,
      }

      // Update task status in database
      if (this.currentTaskId) {
        databaseManager.updateTask(this.currentTaskId, 'failed', error.message)
      }

      this.messageHandler?.(errorMessage)
      this.process = null
      this.currentTaskId = null
    })
  }

  /**
   * Stop current task
   */
  stop(): void {
    if (this.process) {
      // Notify message handler before cleanup so pending Promises can resolve
      this.messageHandler?.({
        type: 'error',
        code: 'STOPPED',
        message: '任务已停止',
      })

      this.process.kill('SIGTERM')
      this.process = null

      // Update task status to stopped
      if (this.currentTaskId) {
        databaseManager.updateTask(this.currentTaskId, 'stopped')
        this.currentTaskId = null
      }

      this.taskStatusSet = false
      this.messageHandler = null
    }
  }

  /**
   * Check if task is running
   */
  isRunning(): boolean {
    return this.process !== null
  }

  /**
   * Get current task ID
   */
  getCurrentTaskId(): number | null {
    return this.currentTaskId
  }

  /**
   * Validate cookie by calling Python API
   * Returns validation result with user info if valid
   */
  async validateCookie(cookie: string): Promise<{
    valid: boolean
    message: string
    userInfo?: {
      userId: string
      nickname: string
      redId: string
      avatar: string
    } | null
  }> {
    return new Promise((resolve, reject) => {
      const pythonPath = this.getPythonPath()
      const cliPath = this.getCliPath()
      const env = this.buildPythonEnv()

      const validateProcess = spawn(pythonPath, [cliPath, 'validate-cookie', JSON.stringify(cookie)], {
        cwd: path.dirname(cliPath),
        env,
      })

      let output = ''
      let errorOutput = ''

      validateProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })

      validateProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })

      validateProcess.on('close', (code) => {
        console.log(`[Cookie validation] process exited with code ${code}`)
        if (output.trim()) {
          console.log('[Cookie validation] stdout:', output.trim())
        }
        if (errorOutput.trim()) {
          console.log('[Cookie validation] stderr:', errorOutput.trim())
        }

        if (output.trim()) {
          const lines = output.trim().split('\n')
          // Get the last valid JSON line (validation result)
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim()
            if (!line) continue
            try {
              const result: PythonMessage = JSON.parse(line)
              if (result.type === 'validation_result') {
                resolve({
                  valid: result.valid ?? false,
                  message: result.message ?? '',
                  userInfo: result.userInfo,
                })
                return
              } else if (result.type === 'error') {
                resolve({
                  valid: false,
                  message: result.message ?? 'Validation failed',
                  userInfo: null,
                })
                return
              }
            } catch {
              // Not a JSON line, try next
              continue
            }
          }
        }

        // Fallback: extract user-friendly message from stderr + stdout
        let message = '验证失败，请重试'
        const combinedOutput = errorOutput + output
        if (combinedOutput) {
          if (combinedOutput.includes('SyntaxError') || combinedOutput.includes('RuntimeError') || combinedOutput.includes('execjs') || combinedOutput.includes('ExternalRuntime') || /\(\d+, ['"]/.test(combinedOutput)) {
            message = '签名引擎执行失败，请确保系统已安装 Node.js（https://nodejs.org）并重启应用'
          } else if (combinedOutput.includes('ModuleNotFoundError') || combinedOutput.includes('No module named')) {
            message = 'Python 依赖缺失，请重新安装应用'
          } else if (combinedOutput.includes('FileNotFoundError')) {
            message = '签名文件缺失，请重新安装应用'
          } else {
            console.error('Cookie validation stderr:', errorOutput)
          }
        }

        resolve({
          valid: false,
          message,
          userInfo: null,
        })
      })

      validateProcess.on('error', (error) => {
        reject(error)
      })
    })
  }
}

// Singleton instance
export const pythonBridge = new PythonBridge()

/**
 * Python Bridge Module
 * Manages Python subprocess for Spider XHS
 */
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { databaseManager } from './database-manager'

export interface SpiderConfig {
  cookie: string
  taskType: 'notes' | 'user' | 'search'
  params: Record<string, any>
  saveOptions: {
    mode: 'excel' | 'media' | 'all'
    excelName?: string
    mediaTypes?: ('video' | 'image')[]
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

  constructor() {}

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

    // Development: use system Python
    return 'python'
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
   * Start spider task
   */
  async start(config: SpiderConfig, onMessage: MessageHandler): Promise<void> {
    if (this.process) {
      throw new Error('Task already running')
    }

    this.messageHandler = onMessage

    // Create task record in database
    this.currentTaskId = databaseManager.createTask(config.taskType, config.params, {
      saveOptions: config.saveOptions,
      paths: config.paths,
      proxy: config.proxy,
    })

    const pythonPath = this.getPythonPath()
    const cliPath = this.getCliPath()
    const configJson = JSON.stringify(config)

    const packagesPath = this.getPackagesPath()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_PATH: process.execPath, // For PyExecJS to find Node.js
    }

    // Add PYTHONPATH if packages path exists
    if (packagesPath) {
      env.PYTHONPATH = packagesPath
    }

    this.process = spawn(pythonPath, [cliPath, configJson], {
      cwd: path.dirname(cliPath), // Set working directory to python-engine folder
      env,
    })

    // Handle stdout (JSON Lines)
    this.process.stdout?.on('data', (data) => {
      const rawOutput = data.toString()
      const lines = rawOutput.split('\n')
      lines.forEach((line: string) => {
        if (line.trim()) {
          try {
            const message: PythonMessage = JSON.parse(line)

            // Save to database
            if (this.currentTaskId) {
              databaseManager.addLog(this.currentTaskId, message)
            }

            this.messageHandler?.(message)
          } catch (error) {
            console.error('Failed to parse Python output:', line)
          }
        }
      })
    })

    // Handle stderr
    this.process.stderr?.on('data', (data) => {
      console.error('Python stderr:', data.toString())
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
      // Update task status in database
      if (this.currentTaskId) {
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
      this.process.kill('SIGTERM')
      this.process = null

      // Update task status to stopped
      if (this.currentTaskId) {
        databaseManager.updateTask(this.currentTaskId, 'stopped')
        this.currentTaskId = null
      }

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
      const packagesPath = this.getPackagesPath()

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_PATH: process.execPath,
      }

      // Add PYTHONPATH if packages path exists
      if (packagesPath) {
        env.PYTHONPATH = packagesPath
      }

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

      validateProcess.on('close', () => {
        if (output.trim()) {
          try {
            const lines = output.trim().split('\n')
            // Get the last valid JSON line (validation result)
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i].trim()
              if (line) {
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
              }
            }
          } catch {
            console.error('Failed to parse validation output:', output)
          }
        }

        // Fallback
        resolve({
          valid: false,
          message: errorOutput || 'Unknown validation error',
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

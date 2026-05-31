/**
 * Configuration Manager
 * Handles app configuration persistence
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

interface AppConfig {
  cookie: string // encrypted
  cookieValidUntil?: number
  paths: {
    media: string
    excel: string
  }
  proxy: {
    enabled: boolean
    url: string
  }
  // Average request interval in milliseconds. Used as the mean of a Poisson
  // (exponential) delay between consecutive crawl requests to reduce bot detection.
  // 0 disables the delay.
  requestDelayMs: number
  lastTask?: {
    type: string
    params: Record<string, any>
  }
}

const DEFAULT_CONFIG: AppConfig = {
  cookie: '',
  paths: {
    media: path.join(app.getPath('home'), 'Spider_XHS', 'media_datas'),
    excel: path.join(app.getPath('home'), 'Spider_XHS', 'excel_datas'),
  },
  proxy: {
    enabled: false,
    url: 'http://127.0.0.1:7890',
  },
  requestDelayMs: 1500,
}

class ConfigManager {
  private configPath: string
  private config: AppConfig
  private encryptionKey: Buffer

  constructor() {
    // Config file location
    this.configPath = path.join(app.getPath('userData'), 'config.json')

    // Simple encryption key (in production, should use keytar or similar)
    // AES-256 requires exactly 32 bytes - use SHA-256 hash to ensure correct length
    const keySource = 'spider-xhs-encryption-key'
    this.encryptionKey = crypto.createHash('sha256').update(keySource).digest()

    // Load config
    this.config = this.load()
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.configPath
  }

  /**
   * Load configuration from disk
   */
  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const loaded = JSON.parse(data)
        return { ...DEFAULT_CONFIG, ...loaded }
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
    return { ...DEFAULT_CONFIG }
  }

  /**
   * Save configuration to disk
   */
  private save(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error('Failed to save config:', error)
      throw error
    }
  }

  /**
   * Encrypt string
   */
  private encrypt(text: string): string {
    if (!text) return ''
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return `${iv.toString('hex')}:${encrypted}`
  }

  /**
   * Decrypt string
   */
  private decrypt(encryptedText: string): string {
    if (!encryptedText) return ''
    try {
      const parts = encryptedText.split(':')
      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch (error) {
      console.error('Failed to decrypt:', error)
      return ''
    }
  }

  /**
   * Get all configuration
   */
  getAll(): AppConfig {
    return {
      ...this.config,
      cookie: this.decrypt(this.config.cookie),
    }
  }

  /**
   * Set cookie
   */
  setCookie(cookie: string, validUntil?: number): void {
    // Trim whitespace and newlines from cookie
    this.config.cookie = this.encrypt(cookie.trim())
    if (validUntil) {
      this.config.cookieValidUntil = validUntil
    }
    this.save()
  }

  /**
   * Get cookie (decrypted)
   */
  getCookie(): string {
    return this.decrypt(this.config.cookie)
  }

  /**
   * Check if cookie is valid (not expired)
   */
  isCookieValid(): boolean {
    if (!this.config.cookie) return false
    if (!this.config.cookieValidUntil) return true
    return Date.now() < this.config.cookieValidUntil
  }

  /**
   * Set paths
   */
  setPaths(paths: Partial<AppConfig['paths']>): void {
    this.config.paths = { ...this.config.paths, ...paths }
    this.save()
  }

  /**
   * Get paths
   */
  getPaths(): AppConfig['paths'] {
    return this.config.paths
  }

  /**
   * Set proxy
   */
  setProxy(proxy: Partial<AppConfig['proxy']>): void {
    this.config.proxy = { ...this.config.proxy, ...proxy }
    this.save()
  }

  /**
   * Get proxy
   */
  getProxy(): AppConfig['proxy'] {
    return this.config.proxy
  }

  /**
   * Set average request delay (ms). Clamped to a non-negative number.
   */
  setRequestDelayMs(delayMs: number): void {
    this.config.requestDelayMs = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0
    this.save()
  }

  /**
   * Get average request delay (ms)
   */
  getRequestDelayMs(): number {
    return this.config.requestDelayMs ?? DEFAULT_CONFIG.requestDelayMs
  }

  /**
   * Save last task
   */
  setLastTask(type: string, params: Record<string, any>): void {
    this.config.lastTask = { type, params }
    this.save()
  }

  /**
   * Get last task
   */
  getLastTask(): AppConfig['lastTask'] | undefined {
    return this.config.lastTask
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.config = { ...DEFAULT_CONFIG }
    this.save()
  }
}

// Singleton instance
export const configManager = new ConfigManager()

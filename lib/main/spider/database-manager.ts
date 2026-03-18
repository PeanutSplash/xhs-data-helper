/**
 * Database Manager
 * Handles task and log persistence using SQLite
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { PythonMessage } from './python-bridge'

export interface Task {
  id: number
  task_type: string
  params: string // JSON
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'warning'
  started_at: number
  completed_at: number | null
  error_message: string | null
  result_count: number
  config: string | null // JSON
}

export interface Log {
  id: number
  task_id: number
  type: string
  level: string | null
  message: string
  timestamp: number
  metadata: string | null // JSON
}

export interface QueueItem {
  id: number
  task_config: string // JSON: { taskType, params, config }
  priority: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: number
  started_at: number | null
  completed_at: number | null
  task_id: number | null // Reference to tasks table when executed
  error_message: string | null
}

class DatabaseManager {
  private db: Database.Database

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'spider.db')

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initialize()
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    // Create tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL,
        params TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        error_message TEXT,
        result_count INTEGER DEFAULT 0,
        config TEXT
      )
    `)

    // Create logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        level TEXT,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `)

    // Create task_queue table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_config TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        task_id INTEGER,
        error_message TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `)

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_started_at ON tasks(started_at);
      CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_queue_status ON task_queue(status);
      CREATE INDEX IF NOT EXISTS idx_queue_priority ON task_queue(priority DESC, created_at ASC);
    `)
  }

  /**
   * Create a new task
   */
  createTask(taskType: string, params: any, config?: any): number {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (task_type, params, status, started_at, config)
      VALUES (?, ?, 'running', ?, ?)
    `)

    const result = stmt.run(
      taskType,
      JSON.stringify(params),
      Date.now(),
      config ? JSON.stringify(config) : null
    )

    return result.lastInsertRowid as number
  }

  /**
   * Update task status
   */
  updateTask(
    taskId: number,
    status: Task['status'],
    errorMessage?: string,
    resultCount?: number
  ): void {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?,
          completed_at = ?,
          error_message = ?,
          result_count = COALESCE(?, result_count)
      WHERE id = ?
    `)

    stmt.run(
      status,
      status !== 'running' ? Date.now() : null,
      errorMessage || null,
      resultCount || null,
      taskId
    )
  }

  /**
   * Add a log entry
   */
  addLog(taskId: number, message: PythonMessage): void {
    const stmt = this.db.prepare(`
      INSERT INTO logs (task_id, type, level, message, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const metadata: any = {}
    if (message.type === 'progress') {
      metadata.current = message.current
      metadata.total = message.total
      metadata.title = message.title
    }

    stmt.run(
      taskId,
      message.type,
      message.level || null,
      message.message || '',
      Date.now(),
      Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
    )
  }

  /**
   * Get current running task or most recent task
   */
  getCurrentTask(): Task | null {
    // First try to get running task
    const runningStmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `)

    const runningTask = runningStmt.get() as Task | null
    if (runningTask) {
      return runningTask
    }

    // If no running task, get the most recent task
    const recentStmt = this.db.prepare(`
      SELECT * FROM tasks
      ORDER BY started_at DESC
      LIMIT 1
    `)

    return recentStmt.get() as Task | null
  }

  /**
   * Get task by ID
   */
  getTask(taskId: number): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?')
    return stmt.get(taskId) as Task | null
  }

  /**
   * Get logs for a task
   */
  getTaskLogs(taskId: number): Log[] {
    const stmt = this.db.prepare(`
      SELECT * FROM logs
      WHERE task_id = ?
      ORDER BY timestamp ASC
    `)

    return stmt.all(taskId) as Log[]
  }

  /**
   * Get recent tasks
   */
  getRecentTasks(limit: number = 50): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      ORDER BY started_at DESC
      LIMIT ?
    `)

    return stmt.all(limit) as Task[]
  }

  /**
   * Delete a task and its logs
   */
  deleteTask(taskId: number): void {
    this.db.prepare('DELETE FROM task_queue WHERE task_id = ?').run(taskId)
    this.db.prepare('DELETE FROM logs WHERE task_id = ?').run(taskId)
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
  }

  /**
   * Clean old logs (older than 30 days)
   */
  cleanOldLogs(): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

    // Delete old logs
    this.db.prepare('DELETE FROM logs WHERE task_id IN (SELECT id FROM tasks WHERE started_at < ?)').run(thirtyDaysAgo)

    // Delete old tasks
    this.db.prepare('DELETE FROM tasks WHERE started_at < ?').run(thirtyDaysAgo)

    // Vacuum to reclaim space
    this.db.exec('VACUUM')
  }

  /**
   * Fix stuck running tasks (mark as stopped if they're not actually running)
   * This handles tasks that were interrupted without proper cleanup.
   * Called on app startup - all 'running' tasks are stuck since no Python process survives a restart.
   */
  fixStuckTasks(): number {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = 'stopped',
          completed_at = ?,
          error_message = '任务被中断'
      WHERE status = 'running'
    `)

    const result = stmt.run(Date.now())

    return result.changes
  }

  /**
   * Fix stuck running queue items (mark as failed on app startup)
   * Queue items stuck in 'running' status means the app was closed mid-task.
   */
  fixStuckQueueItems(): number {
    const stmt = this.db.prepare(`
      UPDATE task_queue
      SET status = 'failed',
          completed_at = ?,
          error_message = '任务被中断（应用重启）'
      WHERE status = 'running'
    `)

    const result = stmt.run(Date.now())

    return result.changes
  }

  // ========== Queue Management Methods ==========

  /**
   * Add task to queue
   */
  addToQueue(taskConfig: { taskType: string; params: any; config?: any }, priority: number = 0): number {
    const stmt = this.db.prepare(`
      INSERT INTO task_queue (task_config, priority, status, created_at)
      VALUES (?, ?, 'pending', ?)
    `)

    const result = stmt.run(
      JSON.stringify(taskConfig),
      priority,
      Date.now()
    )

    return result.lastInsertRowid as number
  }

  /**
   * Get all queue items
   */
  getQueueItems(status?: QueueItem['status']): QueueItem[] {
    let query = 'SELECT * FROM task_queue'
    const params: any[] = []

    if (status) {
      query += ' WHERE status = ?'
      params.push(status)
    }

    query += ' ORDER BY priority DESC, created_at ASC'

    const stmt = this.db.prepare(query)
    return stmt.all(...params) as QueueItem[]
  }

  /**
   * Get next pending queue item
   */
  getNextQueueItem(): QueueItem | null {
    const stmt = this.db.prepare(`
      SELECT * FROM task_queue
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `)

    return stmt.get() as QueueItem | null
  }

  /**
   * Update queue item status
   */
  updateQueueItem(
    queueId: number,
    status: QueueItem['status'],
    updates?: {
      taskId?: number
      errorMessage?: string
    }
  ): void {
    const now = Date.now()

    let query = 'UPDATE task_queue SET status = ?'
    const params: any[] = [status]

    if (status === 'running') {
      query += ', started_at = ?'
      params.push(now)
    }

    if (status === 'completed' || status === 'failed') {
      query += ', completed_at = ?'
      params.push(now)
    }

    if (updates?.taskId !== undefined) {
      query += ', task_id = ?'
      params.push(updates.taskId)
    }

    if (updates?.errorMessage !== undefined) {
      query += ', error_message = ?'
      params.push(updates.errorMessage)
    }

    query += ' WHERE id = ?'
    params.push(queueId)

    this.db.prepare(query).run(...params)
  }

  /**
   * Delete queue item
   */
  deleteQueueItem(queueId: number): void {
    this.db.prepare('DELETE FROM task_queue WHERE id = ?').run(queueId)
  }

  /**
   * Update queue item priority
   */
  updateQueuePriority(queueId: number, priority: number): void {
    this.db.prepare('UPDATE task_queue SET priority = ? WHERE id = ?').run(priority, queueId)
  }

  /**
   * Clear completed/failed queue items
   */
  clearCompletedQueue(): void {
    this.db.prepare("DELETE FROM task_queue WHERE status IN ('completed', 'failed')").run()
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): { pending: number; running: number; completed: number; failed: number; total: number } {
    const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM task_queue
      GROUP BY status
    `)

    const results = stmt.all() as { status: string; count: number }[]

    const stats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      total: 0
    }

    results.forEach(row => {
      const status = row.status as QueueItem['status']
      stats[status] = row.count
      stats.total += row.count
    })

    return stats
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close()
  }
}

// Singleton instance
export const databaseManager = new DatabaseManager()

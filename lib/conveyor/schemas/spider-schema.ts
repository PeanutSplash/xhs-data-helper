import { z } from 'zod'

// Spider Config Schema
export const SpiderConfigSchema = z.object({
  cookie: z.string(),
  taskType: z.enum(['notes', 'user', 'search']),
  params: z.record(z.string(), z.any()),
  saveOptions: z.object({
    mode: z.enum(['excel', 'media', 'all']),
    excelName: z.string().optional(),
  }),
  paths: z.object({
    media: z.string(),
    excel: z.string(),
  }),
  proxy: z.string().optional(),
})

export type SpiderConfig = z.infer<typeof SpiderConfigSchema>

// Python Message Schema
export const PythonMessageSchema = z.object({
  type: z.enum(['log', 'progress', 'media', 'done', 'error']),
  level: z.enum(['INFO', 'WARNING', 'ERROR']).optional(),
  message: z.string().optional(),
  current: z.number().optional(),
  total: z.number().optional(),
  title: z.string().optional(),
  noteId: z.string().optional(),
  action: z.string().optional(),
  file: z.string().optional(),
  progress: z.number().optional(),
  success: z.boolean().optional(),
  count: z.number().optional(),
  files: z.array(z.string()).optional(),
  code: z.string().optional(),
})

export type PythonMessage = z.infer<typeof PythonMessageSchema>

// Config Schema
export const ConfigSchema = z.object({
  cookie: z.string(),
  cookieValidUntil: z.number().optional(),
  paths: z.object({
    media: z.string(),
    excel: z.string(),
  }),
  proxy: z.object({
    enabled: z.boolean(),
    url: z.string(),
  }),
  lastTask: z
    .object({
      type: z.string(),
      params: z.record(z.string(), z.any()),
    })
    .optional(),
})

export type Config = z.infer<typeof ConfigSchema>

// Queue Item Schema
export const QueueItemSchema = z.object({
  id: z.number(),
  task_config: z.string(),
  priority: z.number(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  created_at: z.number(),
  started_at: z.number().nullable(),
  completed_at: z.number().nullable(),
  task_id: z.number().nullable(),
  error_message: z.string().nullable(),
})

export type QueueItem = z.infer<typeof QueueItemSchema>

// Queue Task Config Schema
export const QueueTaskConfigSchema = z.object({
  taskType: z.enum(['notes', 'user', 'search']),
  params: z.record(z.string(), z.any()),
  config: z.any().optional(),
})

export type QueueTaskConfig = z.infer<typeof QueueTaskConfigSchema>

// Queue Status Schema
export const QueueStatusSchema = z.object({
  status: z.enum(['idle', 'running', 'paused']),
  currentItem: QueueItemSchema.nullable(),
  stats: z.object({
    pending: z.number(),
    running: z.number(),
    completed: z.number(),
    failed: z.number(),
    total: z.number(),
  }),
})

export type QueueStatus = z.infer<typeof QueueStatusSchema>

import { useState, useEffect } from 'react'
import { History, Trash2, ChevronDown, ChevronUp, FileSpreadsheet, CheckCircle, XCircle, Clock, Search, FolderOpen, AlertTriangle, Activity, RefreshCw, ChevronLeft, ChevronRight, Square } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Progress } from '../components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import type { Task, Log } from '../../lib/conveyor/api/spider-api'
import type { QueueItem } from '../../lib/conveyor/schemas/spider-schema'

interface ExcelPreviewData {
  data: any[][]
  sheetName: string
  filePath: string
}

export default function HistoryPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null)
  const [taskLogs, setTaskLogs] = useState<Log[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [excelPreview, setExcelPreview] = useState<ExcelPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)

  // Queue state
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0 })
  const [currentTask, setCurrentTask] = useState('')

  useEffect(() => {
    loadTasks()
    loadQueue()

    // Listen to queue status updates
    const unsubscribeQueue = window.conveyor.spider.onQueueStatus(() => {
      loadQueue()
      loadTasks() // Refresh tasks when queue updates
    })

    // Listen to spider messages for progress updates
    const unsubscribeMessage = window.conveyor.spider.onMessage((message) => {
      if (message.type === 'progress') {
        setCurrentProgress({
          current: message.current || 0,
          total: message.total || 0,
        })
        setCurrentTask(message.title || message.message || '')
      } else if (message.type === 'done' || message.type === 'error') {
        setCurrentProgress({ current: 0, total: 0 })
        setCurrentTask('')
        loadTasks() // Refresh tasks when complete
      }
    })

    // Refresh every 5 seconds
    const interval = setInterval(() => {
      loadQueue()
      loadTasks()
    }, 5000)

    return () => {
      unsubscribeQueue()
      unsubscribeMessage()
      clearInterval(interval)
    }
  }, [])

  const loadTasks = async () => {
    try {
      const recentTasks = await window.conveyor.spider.getRecentTasks(100)
      setTasks(recentTasks)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadQueue = async () => {
    try {
      const items = await window.conveyor.spider.getQueueItems()
      setQueueItems(items)
    } catch (error) {
      console.error('Failed to load queue:', error)
    }
  }

  const handleExpandTask = async (taskId: number) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null)
      setTaskLogs([])
    } else {
      setExpandedTaskId(taskId)
      try {
        const logs = await window.conveyor.spider.getTaskLogs(taskId)
        setTaskLogs(logs)
      } catch (error) {
        console.error('Failed to load task logs:', error)
      }
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    setTaskToDelete(taskId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return

    try {
      await window.conveyor.spider.deleteTask(taskToDelete)
      setTasks(tasks.filter(t => t.id !== taskToDelete))
      if (expandedTaskId === taskToDelete) {
        setExpandedTaskId(null)
        setTaskLogs([])
      }
      toast.success('任务记录已删除')
    } catch (error) {
      console.error('Failed to delete task:', error)
      toast.error('删除失败')
    } finally {
      setDeleteDialogOpen(false)
      setTaskToDelete(null)
    }
  }

  const handlePreviewExcel = async (task: Task) => {
    try {
      const config = task.config ? JSON.parse(task.config) : null
      if (!config?.paths?.excel) {
        toast.error('无法获取 Excel 文件路径')
        return
      }

      const params = JSON.parse(task.params)
      let excelName = ''
      if (task.task_type === 'search') {
        excelName = params.query || 'search'
      } else if (task.task_type === 'user') {
        excelName = params.userUrl?.split('/').pop()?.split('?')[0] || 'user'
      } else {
        excelName = config.saveOptions?.excelName || 'data'
      }

      const filePath = `${config.paths.excel}/${excelName}.xlsx`
      const result = await window.conveyor.spider.readExcelFile(filePath)

      if (result.success && result.data) {
        setExcelPreview({
          data: result.data,
          sheetName: result.sheetName || 'Sheet1',
          filePath
        })
      } else {
        toast.error(`无法读取 Excel 文件: ${result.error}`)
      }
    } catch (error) {
      console.error('Failed to preview Excel:', error)
      toast.error('预览 Excel 失败')
    }
  }

  const handleOpenFolder = async (task: Task) => {
    try {
      const config = task.config ? JSON.parse(task.config) : null
      const mode = config?.saveOptions?.mode

      // 根据保存模式确定要打开的目录
      let folderPath = ''
      if (mode === 'media') {
        folderPath = config?.paths?.media
      } else if (mode === 'excel') {
        folderPath = config?.paths?.excel
      } else if (mode === 'all') {
        // 优先打开媒体目录
        folderPath = config?.paths?.media || config?.paths?.excel
      }

      if (!folderPath) {
        toast.error('无法获取保存目录')
        return
      }

      const result = await window.conveyor.spider.openFolder(folderPath)
      if (!result.success) {
        toast.error(`无法打开目录: ${result.error}`)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      toast.error('打开目录失败')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle className="w-3 h-3 mr-1" />完成</Badge>
      case 'warning':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><AlertTriangle className="w-3 h-3 mr-1" />警告</Badge>
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />失败</Badge>
      case 'running':
        return <Badge className="bg-primary/10 text-primary border-primary/20"><Clock className="w-3 h-3 mr-1 animate-spin" />运行中</Badge>
      case 'stopped':
        return <Badge variant="secondary">已停止</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case 'search': return '关键词搜索'
      case 'user': return '用户笔记'
      case 'notes': return '指定笔记'
      default: return type
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getQueueTaskDescription = (taskConfig: string) => {
    try {
      const config = JSON.parse(taskConfig)
      if (config.taskType === 'notes') {
        return `${config.params.notes?.length || 0} 个笔记`
      } else if (config.taskType === 'user') {
        const url = config.params.userUrl || ''
        const userId = url.split('/').pop()?.split('?')[0] || '用户'
        return `博主: ${userId}`
      } else if (config.taskType === 'search') {
        return `关键词: ${config.params.query || '搜索'}`
      }
      return '-'
    } catch {
      return '-'
    }
  }

  const handleRemoveFromQueue = async (queueId: number) => {
    try {
      const result = await window.conveyor.spider.removeFromQueue(queueId)
      if (result.success) {
        toast.success('已移除')
        loadQueue()
      } else {
        toast.error(result.message || '移除失败')
      }
    } catch (error) {
      console.error('Failed to remove from queue:', error)
      toast.error('移除失败')
    }
  }

  const handleRetryQueue = async (item: QueueItem) => {
    try {
      await window.conveyor.spider.removeFromQueue(item.id)
      const taskConfig = JSON.parse(item.task_config)
      await window.conveyor.spider.addToQueue(taskConfig)
      await window.conveyor.spider.startQueue()
      toast.success('已重新加入下载队列')
      loadQueue()
    } catch (error) {
      console.error('Failed to retry:', error)
      toast.error('重试失败')
    }
  }

  const handleStopQueue = async () => {
    try {
      const result = await window.conveyor.spider.stopQueue()
      if (result.success) {
        toast.success('已停止下载')
        loadQueue()
        loadTasks()
      } else {
        toast.error(result.message || '停止失败')
      }
    } catch (error) {
      console.error('Failed to stop queue:', error)
      toast.error('停止失败')
    }
  }

  const handleStopTask = async (taskId: number) => {
    try {
      // Try to stop the running process first
      const isRunning = await window.conveyor.spider.isRunning()
      if (isRunning) {
        await window.conveyor.spider.stopQueue()
      } else {
        // Process is not running, just fix the stuck database record
        await window.conveyor.spider.deleteTask(taskId)
      }
      toast.success('任务已停止')
      loadQueue()
      loadTasks()
    } catch (error) {
      console.error('Failed to stop task:', error)
      toast.error('停止失败')
    }
  }

  const filteredTasks = tasks.filter(task => {
    if (!searchTerm) return true
    const params = JSON.parse(task.params)
    const searchText = `${task.task_type} ${params.query || ''} ${params.userUrl || ''}`.toLowerCase()
    return searchText.includes(searchTerm.toLowerCase())
  })

  const runningItems = queueItems.filter(item => item.status === 'running')
  const pendingItems = queueItems.filter(item => item.status === 'pending')
  const failedQueueItems = queueItems.filter(item => item.status === 'failed')

  // Pagination
  const totalPages = Math.ceil(filteredTasks.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedTasks = filteredTasks.slice(startIndex, endIndex)

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  } as const

  const itemVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: 'spring' as const, stiffness: 100, damping: 15 }
    }
  } as const

  return (
    <TooltipProvider>
      <motion.div className="space-y-6 pb-12" variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">历史记录</h1>
        <p className="text-muted-foreground mt-2 text-lg">查看下载状态和历史记录</p>
      </motion.div>

      {/* Queue Status - Running & Pending */}
      {(runningItems.length > 0 || pendingItems.length > 0 || failedQueueItems.length > 0) && (
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-4">
          {/* Running */}
          {runningItems.length > 0 && (
            <Card className="border-primary/50 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between w-full">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 animate-pulse text-primary" />
                    正在下载
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStopQueue}
                    className="border-red-500/30 hover:bg-red-500/10 text-red-500"
                  >
                    <Square className="w-3 h-3 mr-1" />
                    停止
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {runningItems.map((item) => (
                  <div key={item.id} className="p-4 rounded-lg bg-background border border-primary/20">
                    <div className="mb-3">
                      <span className="font-medium text-foreground">{getQueueTaskDescription(item.task_config)}</span>
                      {currentTask && (
                        <p className="text-xs text-muted-foreground truncate mt-1">{currentTask}</p>
                      )}
                    </div>
                    {currentProgress.total > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {currentProgress.current} / {currentProgress.total}
                          </span>
                          <span className="font-bold text-primary">
                            {Math.round((currentProgress.current / currentProgress.total) * 100)}%
                          </span>
                        </div>
                        <Progress value={(currentProgress.current / currentProgress.total) * 100} className="h-2" />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pending */}
          {pendingItems.length > 0 && (
            <Card className="border-yellow-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  等待中 ({pendingItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50 hover:bg-secondary/50 transition-colors"
                  >
                    <span className="text-sm text-foreground truncate flex-1">
                      {getQueueTaskDescription(item.task_config)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveFromQueue(item.id)}
                      className="flex-shrink-0 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Failed Queue Items */}
          {failedQueueItems.length > 0 && (
            <Card className="border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  下载失败 ({failedQueueItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {failedQueueItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-red-500/5 border border-red-500/20"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground mb-1">
                          {getQueueTaskDescription(item.task_config)}
                        </div>
                        {item.error_message && (
                          <p className="text-xs text-red-500">{item.error_message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetryQueue(item)}
                          className="border-red-500/30 hover:bg-red-500/10"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          重试
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveFromQueue(item.id)}
                          className="hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Search */}
      <motion.div variants={itemVariants}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索任务..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </motion.div>

      {/* Task List */}
      <motion.div variants={itemVariants}>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <History className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>历史任务</CardTitle>
                  <CardDescription>
                    共 {filteredTasks.length} 条记录
                    {totalPages > 1 && ` · 第 ${currentPage}/${totalPages} 页`}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : paginatedTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? '未找到匹配的任务' : '暂无历史记录'}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedTasks.map((task) => {
                  const params = JSON.parse(task.params)
                  const isExpanded = expandedTaskId === task.id

                  return (
                    <div key={task.id} className="border border-border rounded-lg overflow-hidden">
                      <div
                        className="p-4 hover:bg-secondary/50 cursor-pointer transition-colors"
                        onClick={() => handleExpandTask(task.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{getTaskTypeLabel(task.task_type)}</span>
                                {getStatusBadge(task.status)}
                              </div>
                              <span className="text-sm text-muted-foreground mt-1">
                                {task.task_type === 'search' && params.query && `关键词: ${params.query}`}
                                {task.task_type === 'user' && params.userUrl && `用户: ${params.userUrl.split('/').pop()?.split('?')[0]}`}
                                {task.task_type === 'notes' && params.notes && `${params.notes.length} 条笔记`}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">{formatDate(task.started_at)}</div>
                              {task.result_count > 0 && (
                                <div className="text-sm font-medium">{task.result_count} 条结果</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {task.status === 'running' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleStopTask(task.id)
                                      }}
                                    >
                                      <Square className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>停止任务</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {task.status === 'completed' && (() => {
                                const config = task.config ? JSON.parse(task.config) : null
                                const hasExcel = config?.saveOptions?.mode === 'excel' || config?.saveOptions?.mode === 'all'
                                return hasExcel
                              })() && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handlePreviewExcel(task)
                                      }}
                                    >
                                      <FileSpreadsheet className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>预览 Excel 文件</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {task.status === 'completed' && task.config && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleOpenFolder(task)
                                      }}
                                    >
                                      <FolderOpen className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>打开保存目录</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteTask(task.id)
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>删除任务记录</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="cursor-pointer">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isExpanded ? '收起详情' : '展开详情'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-border bg-secondary/20"
                          >
                            <div className="p-4">
                              <h4 className="text-sm font-medium mb-2">执行日志</h4>
                              <div className="bg-background rounded-lg p-3 max-h-60 overflow-y-auto font-mono text-xs space-y-1">
                                {taskLogs.length === 0 ? (
                                  <div className="text-muted-foreground">暂无日志</div>
                                ) : (
                                  taskLogs.map((log) => (
                                    <div key={log.id} className="flex gap-2">
                                      <span className="text-muted-foreground shrink-0">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                      </span>
                                      {log.level && (
                                        <span className={`shrink-0 ${
                                          log.level === 'ERROR' ? 'text-red-500' :
                                          log.level === 'WARNING' ? 'text-yellow-500' :
                                          'text-blue-500'
                                        }`}>
                                          [{log.level}]
                                        </span>
                                      )}
                                      <span className="break-all">{log.message}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                              {task.error_message && (
                                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                  <p className="text-sm text-red-500">{task.error_message}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    显示第 {startIndex + 1}-{Math.min(endIndex, filteredTasks.length)} 条，共 {filteredTasks.length} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      上一页
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      下一页
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Excel Preview Modal */}
      <AnimatePresence>
        {excelPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setExcelPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-lg w-full max-w-6xl max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Excel 预览</h3>
                  <p className="text-sm text-muted-foreground">{excelPreview.filePath}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // 获取文件所在目录
                      const dirPath = excelPreview.filePath.substring(0, excelPreview.filePath.lastIndexOf('/'))
                      const result = await window.conveyor.spider.openFolder(dirPath)
                      if (!result.success) {
                        toast.error(`无法打开目录: ${result.error}`)
                      }
                    }}
                  >
                    <FolderOpen className="w-4 h-4 mr-1" />
                    打开目录
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setExcelPreview(null)}>
                    关闭
                  </Button>
                </div>
              </div>
              <div className="overflow-auto max-h-[calc(80vh-80px)]">
                <table className="w-full text-sm">
                  <thead className="bg-secondary sticky top-0">
                    <tr>
                      {excelPreview.data[0]?.map((header: any, i: number) => (
                        <th key={i} className="px-3 py-2 text-left font-medium border-r border-border last:border-r-0 whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelPreview.data.slice(1).map((row: any[], rowIndex: number) => (
                      <tr key={rowIndex} className="border-t border-border hover:bg-secondary/50">
                        {row.map((cell: any, cellIndex: number) => (
                          <td key={cellIndex} className="px-3 py-2 border-r border-border last:border-r-0 max-w-xs truncate" title={String(cell)}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {excelPreview.data.length <= 1 && (
                  <div className="text-center py-8 text-muted-foreground">无数据</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条任务记录吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTask}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
    </TooltipProvider>
  )
}

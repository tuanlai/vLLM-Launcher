import { useEffect, useRef, useState, useCallback } from 'react'

export interface LogEntry {
  timestamp: number
  level: string
  message: string
  stream: string
}

export interface Metrics {
  prefill_throughput: number
  decode_throughput: number
  total_tokens: number
  requests_active: number
  requests_waiting: number
  gpu_cache_usage: number
  timestamp: number
}

export interface InstanceStatus {
  id: string
  state: string
  pid: number | null
  start_time: string | null
  model: string | null
  model_loaded: boolean
  load_time: number | null
  last_error: string | null
  metrics: Metrics
  config: Record<string, any> | null
}

export interface ErrorData {
  error_type: string
  message: string
  title: string
  description: string
  suggestions: string[]
  severity: string
}

export interface WSMessage {
  type: 'log' | 'metrics' | 'status' | 'error'
  data: any
}

export interface UseWebSocketReturn {
  instances: InstanceStatus[]
  selectedInstanceId: string | null
  selectInstance: (id: string) => void
  getLogs: (instanceId: string) => LogEntry[]
  getMetrics: (instanceId: string) => Metrics
  getMetricsHistory: (instanceId: string) => Metrics[]
  getStatus: (instanceId: string) => InstanceStatus | null
  createInstance: (config: Record<string, any>) => Promise<string>
  startInstance: (instanceId: string) => Promise<void>
  stopInstance: (instanceId: string) => Promise<void>
  deleteInstance: (instanceId: string) => Promise<void>
  refreshInstances: () => Promise<void>
  clearLogs: (instanceId: string) => void
  lastError: ErrorData | null
  clearError: () => void
}

const DEFAULT_METRICS: Metrics = {
  prefill_throughput: 0,
  decode_throughput: 0,
  total_tokens: 0,
  requests_active: 0,
  requests_waiting: 0,
  gpu_cache_usage: 0,
  timestamp: 0,
}

const MAX_LOGS = 3000
const MAX_METRICS_HISTORY = 120

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8001`
  : ''

export function useWebSocket(): UseWebSocketReturn {
  const [instances, setInstances] = useState<InstanceStatus[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [lastError, setLastError] = useState<ErrorData | null>(null)

  // Per-instance data stores
  const logsMap = useRef<Map<string, LogEntry[]>>(new Map())
  const metricsMap = useRef<Map<string, Metrics>>(new Map())
  const metricsHistoryMap = useRef<Map<string, Metrics[]>>(new Map())

  // WebSocket connections per instance
  const wsMap = useRef<Map<string, WebSocket>>(new Map())
  const reconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Force re-render trigger for map updates
  const [, forceUpdate] = useState(0)

  const connectInstance = useCallback((instanceId: string) => {
    // Don't connect if already connected
    if (wsMap.current.has(instanceId)) {
      const existing = wsMap.current.get(instanceId)
      if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) {
        return
      }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const isDev = import.meta.env.DEV
    const wsUrl = isDev
      ? `ws://${window.location.hostname}:8001/ws/${instanceId}`
      : `${protocol}//${window.location.host}/ws/${instanceId}`

    const ws = new WebSocket(wsUrl)
    wsMap.current.set(instanceId, ws)

    ws.onopen = () => {
      // Connection established
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)

        switch (msg.type) {
          case 'status':
            setInstances((prev) => {
              const idx = prev.findIndex((i) => i.id === instanceId)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = { ...next[idx], ...msg.data }
                return next
              }
              // If not found, it might be a new instance - add it
              return [...prev, msg.data]
            })
            break

          case 'log': {
            const currentLogs = logsMap.current.get(instanceId) || []
            const next = [...currentLogs, msg.data]
            logsMap.current.set(
              instanceId,
              next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next
            )
            forceUpdate((n) => n + 1)
            break
          }

          case 'metrics': {
            metricsMap.current.set(instanceId, msg.data)
            const currentHistory = metricsHistoryMap.current.get(instanceId) || []
            const nextHistory = [...currentHistory, msg.data]
            metricsHistoryMap.current.set(
              instanceId,
              nextHistory.length > MAX_METRICS_HISTORY
                ? nextHistory.slice(-MAX_METRICS_HISTORY)
                : nextHistory
            )
            forceUpdate((n) => n + 1)
            break
          }

          case 'error':
            setLastError(msg.data)
            break
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      wsMap.current.delete(instanceId)
      // Auto-reconnect after 2 seconds
      const timer = setTimeout(() => {
        reconnectTimers.current.delete(instanceId)
        connectInstance(instanceId)
      }, 2000)
      reconnectTimers.current.set(instanceId, timer)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  const selectInstance = useCallback((id: string) => {
    setSelectedInstanceId(id)
    // Connect WebSocket if not already connected
    connectInstance(id)
  }, [connectInstance])

  const refreshInstances = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/instances`)
      if (res.ok) {
        const data = await res.json()
        setInstances(data)
      }
    } catch {
      // ignore fetch errors
    }
  }, [])

  const createInstance = useCallback(async (config: Record<string, any>): Promise<string> => {
    const res = await fetch(`${API_BASE}/api/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Failed to create instance')
    }
    const data = await res.json()
    await refreshInstances()
    return data.id
  }, [refreshInstances])

  const startInstance = useCallback(async (instanceId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/instances/${instanceId}/start`, {
      method: 'POST',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Failed to start instance')
    }
    await refreshInstances()
  }, [refreshInstances])

  const stopInstance = useCallback(async (instanceId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/instances/${instanceId}/stop`, {
      method: 'POST',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Failed to stop instance')
    }
    await refreshInstances()
  }, [refreshInstances])

  const deleteInstance = useCallback(async (instanceId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/instances/${instanceId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Failed to delete instance')
    }
    // Clean up local data
    logsMap.current.delete(instanceId)
    metricsMap.current.delete(instanceId)
    metricsHistoryMap.current.delete(instanceId)
    // Close WebSocket if connected
    const ws = wsMap.current.get(instanceId)
    if (ws) {
      ws.close()
      wsMap.current.delete(instanceId)
    }
    // Clear reconnect timer
    const timer = reconnectTimers.current.get(instanceId)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.current.delete(instanceId)
    }
    // Clear selection if deleted
    setSelectedInstanceId((prev) => (prev === instanceId ? null : prev))
    await refreshInstances()
  }, [refreshInstances])

  const getLogs = useCallback((instanceId: string): LogEntry[] => {
    return logsMap.current.get(instanceId) || []
  }, [])

  const getMetrics = useCallback((instanceId: string): Metrics => {
    return metricsMap.current.get(instanceId) || DEFAULT_METRICS
  }, [])

  const getMetricsHistory = useCallback((instanceId: string): Metrics[] => {
    return metricsHistoryMap.current.get(instanceId) || []
  }, [])

  const getStatus = useCallback((instanceId: string): InstanceStatus | null => {
    return instances.find((i) => i.id === instanceId) || null
  }, [instances])

  const clearLogs = useCallback((instanceId: string) => {
    logsMap.current.set(instanceId, [])
    forceUpdate((n) => n + 1)
  }, [])

  const clearError = useCallback(() => {
    setLastError(null)
  }, [])

  // Fetch instances on mount
  useEffect(() => {
    refreshInstances()
  }, [refreshInstances])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Close all WebSocket connections
      wsMap.current.forEach((ws) => ws.close())
      wsMap.current.clear()
      // Clear all reconnect timers
      reconnectTimers.current.forEach((timer) => clearTimeout(timer))
      reconnectTimers.current.clear()
    }
  }, [])

  return {
    instances,
    selectedInstanceId,
    selectInstance,
    getLogs,
    getMetrics,
    getMetricsHistory,
    getStatus,
    createInstance,
    startInstance,
    stopInstance,
    deleteInstance,
    refreshInstances,
    clearLogs,
    lastError,
    clearError,
  }
}

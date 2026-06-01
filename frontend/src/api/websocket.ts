import { useEffect, useRef, useState, useCallback } from 'react'
import { API_BASE } from './config'
import type { LogEntry, Metrics, InstanceStatus, ErrorData, WSMessage } from './types'
import { DEFAULT_METRICS } from './types'

export type { LogEntry, Metrics, InstanceStatus, ErrorData, WSMessage }
export { DEFAULT_METRICS }

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
  cleanOrphanPorts: () => Promise<{ found: number; killed: number; orphans: Array<{ pid: number; port: number | null; model: string }> }>
  lastError: ErrorData | null
  clearError: () => void
}

const MAX_LOGS = 3000
const MAX_METRICS_HISTORY = 120

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
  const reconnectAttempts = useRef<Map<string, number>>(new Map())

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
      // Reset reconnect attempts on successful connection
      reconnectAttempts.current.set(instanceId, 0)
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
      const attempts = (reconnectAttempts.current.get(instanceId) || 0) + 1
      if (attempts > 10) {
        reconnectAttempts.current.delete(instanceId)
        return
      }
      reconnectAttempts.current.set(instanceId, attempts)
      const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000)
      const timer = setTimeout(() => {
        reconnectTimers.current.delete(instanceId)
        connectInstance(instanceId)
      }, delay)
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
        // Merge with WS-enriched state instead of blind replace
        setInstances((prev) => {
          const prevMap = new Map(prev.map((i) => [i.id, i]))
          return data.map((d: InstanceStatus) => {
            const existing = prevMap.get(d.id)
            if (existing) {
              // Preserve WS-enriched metrics
              return { ...d, metrics: existing.metrics }
            }
            return d
          })
        })
        // Clear stale selection if instance IDs changed (e.g., backend restart)
        setSelectedInstanceId((prev) => {
          if (prev && !data.some((i: InstanceStatus) => i.id === prev)) {
            const running = data.find((i: InstanceStatus) => i.state === 'running')
            return running?.id || null
          }
          return prev
        })
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
    return data.instance_id
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
    // Clear reconnect timer and attempts
    const timer = reconnectTimers.current.get(instanceId)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.current.delete(instanceId)
    }
    reconnectAttempts.current.delete(instanceId)
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

  const cleanOrphanPorts = useCallback(async (): Promise<{ found: number; killed: number; orphans: Array<{ pid: number; port: number | null; model: string }> }> => {
    const res = await fetch(`${API_BASE}/api/ports/clean`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Failed to clean ports')
    }
    const data = await res.json()
    await refreshInstances()
    return data
  }, [refreshInstances])

  // Fetch instances on mount and periodically
  useEffect(() => {
    refreshInstances()
    const interval = setInterval(refreshInstances, 5000)
    return () => clearInterval(interval)
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
      // Clear all reconnect attempt counters
      reconnectAttempts.current.clear()
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
    cleanOrphanPorts,
    lastError,
    clearError,
  }
}

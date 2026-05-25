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

export interface StatusData {
  state: string
  pid: number | null
  start_time: string | null
  model: string | null
  model_loaded: boolean
  load_time: number | null
  last_error: string | null
  metrics: Metrics
  config: {
    model: string
    tensor_parallel_size: number
    port: number
    gpu_memory_utilization: number
    max_model_len: number | null
    quantization: string | null
  } | null
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
  connected: boolean
  status: StatusData
  logs: LogEntry[]
  metrics: Metrics
  metricsHistory: Metrics[]
  lastError: ErrorData | null
  startServer: (config: Record<string, any>) => void
  stopServer: () => void
  clearLogs: () => void
  clearError: () => void
}

const DEFAULT_STATUS: StatusData = {
  state: 'idle',
  pid: null,
  start_time: null,
  model: null,
  model_loaded: false,
  load_time: null,
  last_error: null,
  metrics: {
    prefill_throughput: 0,
    decode_throughput: 0,
    total_tokens: 0,
    requests_active: 0,
    requests_waiting: 0,
    gpu_cache_usage: 0,
    timestamp: 0,
  },
  config: null,
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

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<StatusData>(DEFAULT_STATUS)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [metrics, setMetrics] = useState<Metrics>(DEFAULT_METRICS)
  const [metricsHistory, setMetricsHistory] = useState<Metrics[]>([])
  const [lastError, setLastError] = useState<ErrorData | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    // In dev mode, connect to backend directly
    const isDev = import.meta.env.DEV
    const wsUrl = isDev
      ? `ws://${host}:8001/ws`
      : `${protocol}//${host}/ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)

        switch (msg.type) {
          case 'status':
            setStatus(msg.data)
            break

          case 'log':
            setLogs((prev) => {
              const next = [...prev, msg.data]
              return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next
            })
            break

          case 'metrics':
            setMetrics(msg.data)
            setMetricsHistory((prev) => {
              const next = [...prev, msg.data]
              return next.length > MAX_METRICS_HISTORY
                ? next.slice(-MAX_METRICS_HISTORY)
                : next
            })
            break

          case 'error':
            setLastError(msg.data)
            break
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const startServer = useCallback((config: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'start', config }))
    }
  }, [])

  const stopServer = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }))
    }
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const clearError = useCallback(() => {
    setLastError(null)
  }, [])

  return {
    connected,
    status,
    logs,
    metrics,
    metricsHistory,
    lastError,
    startServer,
    stopServer,
    clearLogs,
    clearError,
  }
}

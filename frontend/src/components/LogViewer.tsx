import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LogEntry } from '../api/websocket'
import { useI18n } from '../i18n'

interface LogViewerProps {
  logs: LogEntry[]
  maxHeight?: string
}

const levelColors: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  metric: '#00d992',
  status: '#8b5cf6',
  system: '#06b6d4',
}

const levelLabels: Record<string, string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERR',
  metric: 'METR',
  status: 'STAT',
  system: 'SYS',
}

export default function LogViewer({ logs, maxHeight = '100%' }: LogViewerProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string | null>(null)

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }, [])

  const filteredLogs = logs.filter((log) => {
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) return false
    if (levelFilter && log.level !== levelFilter) return false
    return true
  })

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="log-viewer" style={{ maxHeight }}>
      <div className="log-toolbar">
        <div className="log-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={t('logs.filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="log-search-input"
          />
        </div>

        <div className="log-filters">
          {Object.entries(levelLabels).map(([level, label]) => (
            <button
              key={level}
              className={`log-filter-btn ${levelFilter === level ? 'active' : ''}`}
              style={{
                color: levelFilter === level ? levelColors[level] : 'var(--mute)',
                borderColor: levelFilter === level ? levelColors[level] : 'transparent',
              }}
              onClick={() => setLevelFilter(levelFilter === level ? null : level)}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="log-count">{t('logs.lineCount', { count: String(filteredLogs.length) })}</span>
      </div>

      <div
        className="log-container"
        ref={containerRef}
        onScroll={handleScroll}
      >
        <AnimatePresence initial={false}>
          {filteredLogs.map((log, i) => (
            <motion.div
              key={`${log.timestamp}-${i}`}
              className="log-line"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.1 }}
            >
              <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
              <span
                className="log-level"
                style={{ color: levelColors[log.level] || '#8b949e' }}
              >
                {levelLabels[log.level] || 'LOG'}
              </span>
              <span className="log-message">{log.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredLogs.length === 0 && (
          <div className="log-empty">
            {logs.length === 0 ? t('logs.noLogs') : t('logs.noFilterMatch')}
          </div>
        )}
      </div>

      {!autoScroll && (
        <button
          className="log-scroll-btn"
          onClick={() => {
            setAutoScroll(true)
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight
            }
          }}
        >
          ↓ {t('logs.scrollToBottom')}
        </button>
      )}

      <style>{`
        .log-viewer {
          display: flex;
          flex-direction: column;
          background: var(--canvas-soft);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          overflow: hidden;
          position: relative;
        }
        .log-toolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--hairline);
          background: var(--canvas-softer);
          flex-shrink: 0;
        }
        .log-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--canvas-soft);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          padding: 4px 10px;
          flex: 1;
          max-width: 300px;
        }
        .log-search-input {
          background: none;
          border: none;
          outline: none;
          color: var(--ink);
          font-size: 12px;
          font-family: var(--font-sans);
          width: 100%;
        }
        .log-search-input::placeholder {
          color: var(--mute);
        }
        .log-filters {
          display: flex;
          gap: 4px;
        }
        .log-filter-btn {
          background: none;
          border: 1px solid transparent;
          border-radius: 4px;
          padding: 3px 8px;
          font-size: 10px;
          font-family: var(--font-mono);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.5px;
        }
        .log-filter-btn:hover {
          background: var(--surface-hover);
        }
        .log-filter-btn.active {
          background: rgba(0, 0, 0, 0.05);
        }
        .log-count {
          font-size: 11px;
          color: var(--mute);
          font-family: var(--font-mono);
          margin-left: auto;
          white-space: nowrap;
        }
        .log-container {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
        }
        .log-line {
          display: flex;
          align-items: baseline;
          gap: 12px;
          padding: 1px 16px;
          white-space: nowrap;
          transition: background 0.1s;
        }
        .log-line:hover {
          background: rgba(0, 0, 0, 0.02);
        }
        .log-timestamp {
          color: var(--mute);
          flex-shrink: 0;
          font-size: 11px;
        }
        .log-level {
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          min-width: 32px;
        }
        .log-message {
          color: var(--body);
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .log-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--mute);
          font-size: 13px;
          font-family: var(--font-sans);
        }
        .log-scroll-btn {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--primary);
          color: #ffffff;
          border: none;
          border-radius: var(--radius-pill);
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transition: transform 0.15s;
        }
        .log-scroll-btn:hover {
          transform: translateX(-50%) scale(1.05);
        }
      `}</style>
    </div>
  )
}

import { motion } from 'framer-motion'
import { useI18n } from '../i18n'

interface StatusBadgeProps {
  state: string
  showLabel?: boolean
}

const stateConfig: Record<string, { color: string; bg: string }> = {
  idle: { color: '#000000', bg: '#f5f5f5' },
  starting: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' },
  running: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)' },
  stopping: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' },
  stopped: { color: '#a3a3a3', bg: '#f5f5f5' },
  error: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
}

export default function StatusBadge({ state, showLabel = true }: StatusBadgeProps) {
  const { t } = useI18n()
  const config = stateConfig[state] || stateConfig.idle
  const label = t(`status.${state}` as any) || state

  return (
    <div className="status-badge" style={{ background: config.bg }}>
      <motion.div
        className="status-badge-dot"
        style={{ background: config.color }}
        animate={
          state === 'running' || state === 'starting'
            ? {
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1],
              }
            : {}
        }
        transition={
          state === 'running' || state === 'starting'
            ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            : {}
        }
      />
      {showLabel && (
        <span style={{ color: config.color, fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}

      <style>{`
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 9999px;
        }
        .status-badge-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}

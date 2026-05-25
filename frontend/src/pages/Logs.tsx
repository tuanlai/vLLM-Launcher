import { motion } from 'framer-motion'
import LogViewer from '../components/LogViewer'
import StatusBadge from '../components/StatusBadge'
import type { UseWebSocketReturn } from '../api/websocket'

interface LogsProps {
  ws: UseWebSocketReturn
}

export default function Logs({ ws }: LogsProps) {
  const { status, logs, clearLogs } = ws

  const pageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  }

  return (
    <motion.div
      className="logs-page"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25 }}
    >
      <div className="logs-header">
        <div>
          <h1 className="page-title">Logs</h1>
          <p className="page-subtitle">Real-time vLLM server output</p>
        </div>
        <div className="logs-actions">
          <StatusBadge state={status.state} />
          <button className="btn btn-ghost" onClick={clearLogs}>
            Clear
          </button>
        </div>
      </div>

      <LogViewer logs={logs} maxHeight="calc(100vh - 160px)" />

      <style>{`
        .logs-page {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .logs-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-shrink: 0;
        }
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: var(--ink);
          letter-spacing: -0.5px;
        }
        .page-subtitle {
          font-size: 14px;
          color: var(--mute);
          margin-top: 4px;
        }
        .logs-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
      `}</style>
    </motion.div>
  )
}

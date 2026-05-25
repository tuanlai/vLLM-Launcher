import { motion } from 'framer-motion'
import ConfigForm from '../components/ConfigForm'
import type { UseWebSocketReturn } from '../api/websocket'

interface SettingsProps {
  ws: UseWebSocketReturn
}

export default function Settings({ ws }: SettingsProps) {
  const { status, startServer } = ws

  const isDisabled = status.state === 'starting' || status.state === 'running'

  const pageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25 }}
    >
      <div className="settings-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure and launch a vLLM server</p>
        </div>
        {isDisabled && (
          <span className="badge badge-warning">
            Server is {status.state}. Stop it first to change settings.
          </span>
        )}
      </div>

      <div className="card">
        <ConfigForm onSubmit={startServer} disabled={isDisabled} />
      </div>

      <style>{`
        .settings-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
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
      `}</style>
    </motion.div>
  )
}

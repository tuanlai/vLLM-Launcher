import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import InstanceCard from '../components/InstanceCard'
import ConfigForm from '../components/ConfigForm'
import type { UseWebSocketReturn } from '../api/websocket'

interface InstancesProps {
  ws: UseWebSocketReturn
}

export default function Instances({ ws }: InstancesProps) {
  const navigate = useNavigate()
  const [showNewModal, setShowNewModal] = useState(false)
  const [creating, setCreating] = useState(false)

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      ws.refreshInstances()
    }, 5000)
    return () => clearInterval(interval)
  }, [ws.refreshInstances])

  const handleCreate = useCallback(async (config: Record<string, any>) => {
    setCreating(true)
    try {
      const id = await ws.createInstance(config)
      await ws.startInstance(id)
      setShowNewModal(false)
    } catch (err) {
      console.error('Failed to create instance:', err)
    } finally {
      setCreating(false)
    }
  }, [ws.createInstance, ws.startInstance])

  const handleStop = useCallback(async (id: string) => {
    try {
      await ws.stopInstance(id)
    } catch (err) {
      console.error('Failed to stop instance:', err)
    }
  }, [ws.stopInstance])

  const handleStart = useCallback(async (id: string) => {
    try {
      await ws.startInstance(id)
    } catch (err) {
      console.error('Failed to start instance:', err)
    }
  }, [ws.startInstance])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await ws.deleteInstance(id)
    } catch (err) {
      console.error('Failed to delete instance:', err)
    }
  }, [ws.deleteInstance])

  const handleViewLogs = useCallback((id: string) => {
    ws.selectInstance(id)
    navigate('/logs')
  }, [ws.selectInstance, navigate])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="instances-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.5 }}>
            Instances
          </h1>
          <p style={{ fontSize: 14, color: 'var(--mute)', marginTop: 4 }}>
            Manage multiple vLLM instances
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
          + New Instance
        </button>
      </div>

      {/* Instance list */}
      <div className="instances-list">
        {ws.instances.length === 0 ? (
          <div className="instances-empty">
            <div className="instances-empty__text">
              No instances running. Create one to get started.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowNewModal(true)}
            >
              + New Instance
            </button>
          </div>
        ) : (
          ws.instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              metrics={ws.getMetrics(instance.id)}
              onStop={() => handleStop(instance.id)}
              onStart={() => handleStart(instance.id)}
              onDelete={() => handleDelete(instance.id)}
              onViewLogs={() => handleViewLogs(instance.id)}
              isSelected={ws.selectedInstanceId === instance.id}
              onSelect={() => ws.selectInstance(instance.id)}
            />
          ))
        )}
      </div>

      {/* New Instance Modal */}
      {showNewModal && (
        <div className="instances-modal__overlay" onClick={() => !creating && setShowNewModal(false)}>
          <div className="instances-modal__card" onClick={(e) => e.stopPropagation()}>
            <div className="instances-modal__header">
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
                New Instance
              </h2>
              <button
                className="btn btn-ghost instances-modal__close"
                onClick={() => !creating && setShowNewModal(false)}
                disabled={creating}
              >
                &times;
              </button>
            </div>
            <div className="instances-modal__body">
              <ConfigForm onSubmit={handleCreate} disabled={creating} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .instances-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: var(--space-3xl);
        }
        .instances-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }
        .instances-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-xl);
          padding: var(--space-5xl) var(--space-xl);
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
        }
        .instances-empty__text {
          font-size: 14px;
          color: var(--mute);
        }
        .instances-modal__overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-xl);
        }
        .instances-modal__card {
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          width: 100%;
          max-width: 860px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        }
        .instances-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-xl) var(--space-2xl);
          border-bottom: 1px solid var(--hairline);
          flex-shrink: 0;
        }
        .instances-modal__close {
          font-size: 20px;
          line-height: 1;
          padding: var(--space-xs) var(--space-sm);
        }
        .instances-modal__body {
          padding: var(--space-2xl);
          overflow-y: auto;
          flex: 1;
        }
      `}</style>
    </motion.div>
  )
}

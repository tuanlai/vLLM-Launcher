import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import InstanceCard from '../components/InstanceCard'
import ConfigForm from '../components/ConfigForm'
import { useI18n } from '../i18n'
import type { UseWebSocketReturn, InstanceStatus } from '../api/websocket'

interface InstancesProps {
  ws: UseWebSocketReturn
}

export default function Instances({ ws }: InstancesProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [showNewModal, setShowNewModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [duplicateConfig, setDuplicateConfig] = useState<Record<string, any> | null>(null)
  const [showCleanModal, setShowCleanModal] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<{
    found: number
    killed: number
    orphans: Array<{ pid: number; port: number | null; model: string }>
  } | null>(null)

  const handleCreate = useCallback(async (config: Record<string, any>) => {
    setCreating(true)
    try {
      await ws.createInstance(config)
      setShowNewModal(false)
      setDuplicateConfig(null)
    } catch (err) {
      console.error('Failed to create instance:', err)
    } finally {
      setCreating(false)
    }
  }, [ws.createInstance])

  const handleDuplicate = useCallback((instance: InstanceStatus) => {
    setDuplicateConfig(instance.config || {})
    setShowNewModal(true)
  }, [])

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

  const handleScanPorts = useCallback(async () => {
    setCleaning(true)
    setCleanResult(null)
    setShowCleanModal(true)
    try {
      const result = await ws.cleanOrphanPorts()
      setCleanResult(result)
    } catch (err) {
      console.error('Failed to clean ports:', err)
    } finally {
      setCleaning(false)
    }
  }, [ws.cleanOrphanPorts])

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
          <h1 className="page-title">
            {t('instances.title')}
          </h1>
          <p className="page-subtitle">
            {t('instances.subtitle')}
          </p>
        </div>
        <div className="instances-header__actions">
          <button
            className="btn btn-ghost instances-header__clean"
            onClick={handleScanPorts}
            disabled={cleaning}
          >
            {cleaning ? t('instances.cleaning') : t('instances.cleanPorts')}
          </button>
          <button className="btn btn-primary" onClick={() => { setDuplicateConfig(null); setShowNewModal(true) }}>
            {t('instances.newInstance')}
          </button>
        </div>
      </div>

      {/* Instance list */}
      <div className="instances-list">
        {ws.instances.length === 0 ? (
          <div className="instances-empty">
            <div className="instances-empty__text">
              {t('instances.empty')}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowNewModal(true)}
            >
              {t('instances.newInstance')}
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
              onDuplicate={() => handleDuplicate(instance)}
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
                {duplicateConfig ? t('instances.duplicateInstance') : t('instances.newInstance')}
              </h2>
              <button
                className="btn btn-ghost instances-modal__close"
                onClick={() => { if (!creating) { setShowNewModal(false); setDuplicateConfig(null) } }}
                disabled={creating}
              >
                &times;
              </button>
            </div>
            <div className="instances-modal__body">
              <ConfigForm onSubmit={handleCreate} disabled={creating} initialConfig={duplicateConfig} />
            </div>
          </div>
        </div>
      )}

      {/* Clean Ports Modal */}
      {showCleanModal && (
        <div className="instances-modal__overlay" onClick={() => !cleaning && setShowCleanModal(false)}>
          <div className="instances-modal__card instances-modal__card--small" onClick={(e) => e.stopPropagation()}>
            <div className="instances-modal__header">
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
                {t('instances.cleanModal.title')}
              </h2>
              <button
                className="btn btn-ghost instances-modal__close"
                onClick={() => { setShowCleanModal(false); setCleanResult(null) }}
                disabled={cleaning}
              >
                &times;
              </button>
            </div>
            <div className="instances-modal__body">
              {cleaning ? (
                <div className="clean-modal__scanning">
                  <div className="clean-modal__spinner" />
                  <span style={{ color: 'var(--mute)', fontSize: 14 }}>{t('instances.cleanModal.scanning')}</span>
                </div>
              ) : cleanResult === null ? (
                <div style={{ color: 'var(--mute)', fontSize: 14 }}>
                  {t('instances.cleanModal.none')}
                </div>
              ) : cleanResult.orphans.length === 0 ? (
                <div className="clean-modal__none">
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                  <span style={{ color: 'var(--mute)', fontSize: 14 }}>
                    {t('instances.cleanModal.none')}
                  </span>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 14, color: 'var(--body)', marginBottom: 16 }}>
                    {t('instances.cleanModal.found').replace('{count}', String(cleanResult.orphans.length))}
                  </p>
                  <div className="clean-modal__table">
                    <div className="clean-modal__table-header">
                      <span>{t('instances.cleanModal.columnPid')}</span>
                      <span>{t('instances.cleanModal.columnPort')}</span>
                      <span>{t('instances.cleanModal.columnModel')}</span>
                    </div>
                    {cleanResult.orphans.map((o) => (
                      <div className="clean-modal__table-row" key={o.pid}>
                        <span className="clean-modal__pid">{o.pid}</span>
                        <span className="clean-modal__port">{o.port ? `:${o.port}` : '—'}</span>
                        <span className="clean-modal__model" title={o.model}>
                          {o.model}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="clean-modal__done">
                    {t('instances.cleanModal.done').replace('{count}', String(cleanResult.killed))}
                  </p>
                </div>
              )}
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
        .instances-header__actions {
          display: flex;
          gap: var(--space-sm);
          align-items: center;
        }
        .instances-header__clean {
          color: var(--error) !important;
        }
        .instances-header__clean:hover {
          background: var(--error-soft) !important;
        }
        .instances-header__clean:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
        .instances-modal__card--small {
          max-width: 600px;
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
        .clean-modal__scanning {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-md);
          padding: var(--space-2xl) 0;
        }
        .clean-modal__spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--hairline);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: clean-spin 0.8s linear infinite;
        }
        @keyframes clean-spin {
          to { transform: rotate(360deg); }
        }
        .clean-modal__none {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-2xl) 0;
          gap: var(--space-sm);
        }
        .clean-modal__table {
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          overflow: hidden;
          margin-bottom: var(--space-md);
        }
        .clean-modal__table-header {
          display: grid;
          grid-template-columns: 80px 100px 1fr;
          background: var(--canvas-soft);
          padding: var(--space-sm) var(--space-md);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--mute);
          border-bottom: 1px solid var(--hairline);
        }
        .clean-modal__table-row {
          display: grid;
          grid-template-columns: 80px 100px 1fr;
          padding: var(--space-sm) var(--space-md);
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--body);
          border-bottom: 1px solid var(--hairline);
        }
        .clean-modal__table-row:last-child {
          border-bottom: none;
        }
        .clean-modal__pid {
          color: var(--ink);
          font-weight: 600;
        }
        .clean-modal__port {
          color: var(--error);
          font-weight: 600;
        }
        .clean-modal__model {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .clean-modal__done {
          font-size: 13px;
          color: var(--success);
          font-weight: 500;
          text-align: center;
          margin-top: var(--space-md);
        }
      `}</style>
    </motion.div>
  )
}

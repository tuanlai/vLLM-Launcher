import { useState } from 'react'
import type { InstanceStatus, Metrics } from '../api/websocket'

interface InstanceCardProps {
  instance: InstanceStatus
  metrics: Metrics
  onStop: () => void
  onStart: () => void
  onDelete: () => void
  onViewLogs: () => void
  isSelected: boolean
  onSelect: () => void
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s ease',
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function InstanceCard({
  instance,
  metrics,
  onStop,
  onStart,
  onDelete,
  onViewLogs,
  isSelected,
  onSelect,
}: InstanceCardProps) {
  const [configExpanded, setConfigExpanded] = useState(false)

  const state = instance.state || 'idle'
  const isRunning = state === 'running'
  const isStarting = state === 'starting'
  const isError = state === 'error'
  const isStopped = state === 'stopped' || state === 'idle'

  const dotColor = isRunning
    ? 'var(--success)'
    : isStarting
      ? 'var(--warning)'
      : isError
        ? 'var(--error)'
        : 'var(--primary)'

  const stateLabel = state.charAt(0).toUpperCase() + state.slice(1)

  const port = instance.config?.port ?? null

  return (
    <div
      className={`instance-card ${isSelected ? 'instance-card--selected' : ''}`}
      onClick={onSelect}
    >
      {/* Header row */}
      <div className="instance-card__header">
        <div className="instance-card__status">
          <span
            className={`instance-card__dot ${isRunning ? 'instance-card__dot--pulse' : ''}`}
            style={{ background: dotColor }}
          />
          <span className="instance-card__state">{stateLabel}</span>
        </div>
        {port && (
          <span className="instance-card__port">:{port}</span>
        )}
      </div>

      {/* Model name */}
      <div className="instance-card__model" title={instance.model || 'No model'}>
        {instance.model || 'No model'}
      </div>

      {/* Inline metrics — only when running */}
      {isRunning && (
        <div className="instance-card__metrics">
          <div className="instance-card__metric">
            <span className="instance-card__metric-label">Prefill</span>
            <span className="instance-card__metric-value">
              {metrics.prefill_throughput.toFixed(1)} <span className="instance-card__metric-unit">tok/s</span>
            </span>
          </div>
          <div className="instance-card__metric">
            <span className="instance-card__metric-label">Decode</span>
            <span className="instance-card__metric-value">
              {metrics.decode_throughput.toFixed(1)} <span className="instance-card__metric-unit">tok/s</span>
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="instance-card__actions" onClick={(e) => e.stopPropagation()}>
        {isRunning || isStarting ? (
          <button className="btn btn-ghost" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onStart} disabled={isError}>
            Start
          </button>
        )}
        <button className="btn btn-ghost" onClick={onViewLogs}>
          Logs
        </button>
        <button className="btn btn-ghost instance-card__delete" onClick={onDelete}>
          Delete
        </button>
      </div>

      {/* Expandable config section */}
      {instance.config && (
        <div className="instance-card__config-section" onClick={(e) => e.stopPropagation()}>
          <button
            className="instance-card__config-toggle"
            onClick={() => setConfigExpanded(!configExpanded)}
          >
            <ChevronIcon open={configExpanded} />
            <span>Config Details</span>
          </button>
          {configExpanded && (
            <div className="instance-card__config-details">
              {Object.entries(instance.config).map(([key, value]) => (
                <div className="instance-card__config-row" key={key}>
                  <span className="instance-card__config-key">{key}</span>
                  <span className="instance-card__config-value">
                    {typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .instance-card {
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          padding: var(--space-lg) var(--space-xl);
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          border-left: 3px solid transparent;
        }
        .instance-card:hover {
          border-color: var(--hairline-soft);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
        }
        .instance-card--selected {
          border-left-color: var(--primary);
          background: var(--canvas-soft);
        }
        .instance-card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-sm);
        }
        .instance-card__status {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        .instance-card__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .instance-card__dot--pulse {
          box-shadow: 0 0 0 0 currentColor;
          animation: ic-pulse-ring 2s ease-out infinite;
        }
        @keyframes ic-pulse-ring {
          0% { box-shadow: 0 0 0 0 var(--success); }
          100% { box-shadow: 0 0 0 6px transparent; }
        }
        .instance-card__state {
          font-size: 12px;
          font-weight: 500;
          color: var(--body);
        }
        .instance-card__port {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--mute);
        }
        .instance-card__model {
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: var(--space-sm);
        }
        .instance-card__metrics {
          display: flex;
          gap: var(--space-xl);
          margin-bottom: var(--space-md);
        }
        .instance-card__metric {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .instance-card__metric-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--mute);
        }
        .instance-card__metric-value {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
        }
        .instance-card__metric-unit {
          font-size: 11px;
          font-weight: 400;
          color: var(--mute);
        }
        .instance-card__actions {
          display: flex;
          gap: var(--space-sm);
          margin-top: var(--space-sm);
        }
        .instance-card__delete {
          color: var(--error) !important;
        }
        .instance-card__delete:hover {
          background: var(--error-soft) !important;
        }
        .instance-card__config-section {
          margin-top: var(--space-md);
          border-top: 1px solid var(--hairline);
          padding-top: var(--space-sm);
        }
        .instance-card__config-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          background: none;
          border: none;
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 12px;
          font-weight: 500;
          color: var(--mute);
          padding: var(--space-xs) 0;
        }
        .instance-card__config-toggle:hover {
          color: var(--body);
        }
        .instance-card__config-details {
          margin-top: var(--space-sm);
          background: var(--canvas-softer);
          border-radius: var(--radius-sm);
          padding: var(--space-md);
          max-height: 200px;
          overflow-y: auto;
        }
        .instance-card__config-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 3px 0;
          border-bottom: 1px solid var(--hairline);
        }
        .instance-card__config-row:last-child {
          border-bottom: none;
        }
        .instance-card__config-key {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--body);
          flex-shrink: 0;
          margin-right: var(--space-md);
        }
        .instance-card__config-value {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--ink);
          text-align: right;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}

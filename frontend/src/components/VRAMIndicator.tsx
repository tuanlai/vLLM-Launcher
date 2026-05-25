export interface VRAMCheckResult {
  total_vram_gb: number
  used_vram_gb: number
  free_vram_gb: number
  model_estimated_gb: number
  feasible: boolean
  message: string
}

interface VRAMIndicatorProps {
  result: VRAMCheckResult | null
  gpuName?: string
}

export default function VRAMIndicator({ result, gpuName }: VRAMIndicatorProps) {
  if (!result) return null

  const usagePercent = result.total_vram_gb > 0
    ? (result.model_estimated_gb / result.total_vram_gb) * 100
    : 0

  const barColor = usagePercent < 75
    ? 'var(--success)'
    : usagePercent < 90
      ? 'var(--warning)'
      : 'var(--error)'

  const bgColor = usagePercent < 75
    ? 'var(--success-soft)'
    : usagePercent < 90
      ? 'var(--warning-soft)'
      : 'var(--error-soft)'

  return (
    <div className="vram-indicator">
      <div className="vram-indicator-header">
        <span className="vram-indicator-title">VRAM Estimate</span>
        {gpuName && <span className="vram-indicator-gpu">{gpuName}</span>}
      </div>

      <div className="vram-indicator-bar-track">
        <div
          className="vram-indicator-bar-fill"
          style={{
            width: `${Math.min(usagePercent, 100)}%`,
            background: barColor,
          }}
        />
      </div>

      <div className="vram-indicator-stats">
        <div className="vram-indicator-stat">
          <span className="vram-indicator-stat-label">Estimated</span>
          <span className="vram-indicator-stat-value" style={{ color: barColor }}>
            {result.model_estimated_gb.toFixed(1)} GB
          </span>
        </div>
        <div className="vram-indicator-stat">
          <span className="vram-indicator-stat-label">Free VRAM</span>
          <span className="vram-indicator-stat-value">
            {result.free_vram_gb.toFixed(1)} GB
          </span>
        </div>
        <div className="vram-indicator-stat">
          <span className="vram-indicator-stat-label">Total VRAM</span>
          <span className="vram-indicator-stat-value">
            {result.total_vram_gb.toFixed(1)} GB
          </span>
        </div>
      </div>

      {!result.feasible && (
        <div className="vram-indicator-warning">
          <WarningIcon />
          <span>{result.message || 'Model may not fit in available VRAM'}</span>
        </div>
      )}

      {result.feasible && result.message && (
        <div className="vram-indicator-ok">
          <CheckIcon />
          <span>{result.message}</span>
        </div>
      )}

      <style>{`
        .vram-indicator {
          margin-top: 12px;
          padding: 14px 16px;
          background: var(--canvas-soft);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
        }
        .vram-indicator-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .vram-indicator-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--ink);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .vram-indicator-gpu {
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--mute);
        }
        .vram-indicator-bar-track {
          height: 6px;
          background: var(--hairline);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .vram-indicator-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.4s ease, background 0.3s ease;
        }
        .vram-indicator-stats {
          display: flex;
          gap: 16px;
        }
        .vram-indicator-stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .vram-indicator-stat-label {
          font-size: 11px;
          color: var(--mute);
        }
        .vram-indicator-stat-value {
          font-size: 14px;
          font-weight: 600;
          font-family: var(--font-mono);
          color: var(--ink);
        }
        .vram-indicator-warning {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: var(--error-soft);
          border-radius: var(--radius-sm);
          font-size: 12px;
          color: var(--error);
          font-weight: 500;
        }
        .vram-indicator-warning svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }
        .vram-indicator-ok {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: var(--success-soft);
          border-radius: var(--radius-sm);
          font-size: 12px;
          color: var(--success);
          font-weight: 500;
        }
        .vram-indicator-ok svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

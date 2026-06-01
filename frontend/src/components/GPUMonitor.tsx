import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../api/config'
import { useI18n } from '../i18n'

interface GPUStats {
  index: number
  name: string
  memory_total_gb: number
  memory_used_gb: number
  memory_free_gb: number
  temperature_c: number
  power_draw_w: number
  power_limit_w: number
  utilization_gpu_pct: number
  utilization_mem_pct: number
  fan_speed_pct: number
}

function MiniGauge({
  value,
  max,
  label,
  display,
  color,
  size = 90,
}: {
  value: number
  max: number
  label: string
  display: string
  color: string
  size?: number
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const r = (size - 12) / 2
  const circumference = Math.PI * r
  const offset = circumference * (1 - pct)
  const center = size / 2

  return (
    <div className="gpu-gauge" style={{ width: size, height: size / 2 + 24 }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        {/* Background arc */}
        <path
          d={`M ${center - r} ${center + 4} A ${r} ${r} 0 0 1 ${center + r} ${center + 4}`}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${center - r} ${center + 4} A ${r} ${r} 0 0 1 ${center + r} ${center + 4}`}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
        {/* Value text */}
        <text
          x={center}
          y={center - 2}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', fill: 'var(--ink)' }}
        >
          {display}
        </text>
      </svg>
      <span className="gpu-gauge-label">{label}</span>
    </div>
  )
}

export default function GPUMonitor() {
  const { t } = useI18n()
  const [gpus, setGpus] = useState<GPUStats[]>([])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gpu`)
      if (res.ok) {
        setGpus(await res.json())
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [fetchStats])

  if (gpus.length === 0) return null

  return (
    <div className="gpu-monitor">
      {gpus.map((gpu) => {
        const memPct = gpu.memory_total_gb > 0
          ? (gpu.memory_used_gb / gpu.memory_total_gb) * 100
          : 0

        const tempColor = gpu.temperature_c > 85 ? '#ef4444' : gpu.temperature_c > 70 ? '#f59e0b' : '#10b981'
        const memColor = memPct > 90 ? '#ef4444' : memPct > 75 ? '#f59e0b' : '#3b82f6'
        const utilColor = gpu.utilization_gpu_pct > 90 ? '#f59e0b' : '#10b981'
        const powerColor = '#8b5cf6'

        return (
          <div key={gpu.index} className="card gpu-monitor-card">
            <div className="card-header">
              <span className="card-title">GPU {gpu.index}</span>
              <span className="card-subtitle">{gpu.name}</span>
            </div>
            <div className="gpu-gauges-row">
              <MiniGauge
                value={gpu.utilization_gpu_pct}
                max={100}
                label={t('gpu.utilization')}
                display={`${gpu.utilization_gpu_pct}%`}
                color={utilColor}
              />
              <MiniGauge
                value={gpu.memory_used_gb}
                max={gpu.memory_total_gb}
                label={t('gpu.vram')}
                display={`${gpu.memory_used_gb.toFixed(0)}G`}
                color={memColor}
              />
              <MiniGauge
                value={gpu.temperature_c}
                max={100}
                label={t('gpu.temp')}
                display={`${gpu.temperature_c}°`}
                color={tempColor}
              />
              <MiniGauge
                value={gpu.power_draw_w}
                max={gpu.power_limit_w || 480}
                label={t('gpu.power')}
                display={`${gpu.power_draw_w}W`}
                color={powerColor}
              />
              <MiniGauge
                value={gpu.fan_speed_pct}
                max={100}
                label={t('gpu.fan')}
                display={`${gpu.fan_speed_pct}%`}
                color="#6b7280"
              />
            </div>
            <div className="gpu-detail-row">
              <span>{t('gpu.vramLabel')}: {gpu.memory_used_gb.toFixed(1)} / {gpu.memory_total_gb.toFixed(1)} GB</span>
              <span>{t('gpu.powerLabel')}: {gpu.power_draw_w}W / {gpu.power_limit_w}W</span>
            </div>
          </div>
        )
      })}

      <style>{`
        .gpu-monitor {
          margin-bottom: 20px;
        }
        .gpu-monitor-card {
          padding: 20px;
        }
        .gpu-gauges-row {
          display: flex;
          justify-content: space-around;
          align-items: flex-end;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .gpu-gauge {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .gpu-gauge-label {
          font-size: 11px;
          color: var(--mute);
          margin-top: 2px;
        }
        .gpu-detail-row {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--hairline);
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--mute);
        }
      `}</style>
    </div>
  )
}

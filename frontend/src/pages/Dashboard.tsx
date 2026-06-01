import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import AnimatedGauge from '../components/AnimatedGauge'
import StatusBadge from '../components/StatusBadge'
import GPUMonitor from '../components/GPUMonitor'
import { useI18n } from '../i18n'
import type { UseWebSocketReturn } from '../api/websocket'
import { DEFAULT_METRICS } from '../api/websocket'

interface DashboardProps {
  ws: UseWebSocketReturn
}

export default function Dashboard({ ws }: DashboardProps) {
  const { t } = useI18n()
  const { selectedInstanceId, getStatus, getMetrics, getMetricsHistory, lastError, stopInstance, clearError } = ws

  const status = selectedInstanceId ? getStatus(selectedInstanceId) : null
  const metrics = selectedInstanceId ? getMetrics(selectedInstanceId) : DEFAULT_METRICS
  const metricsHistory = selectedInstanceId ? getMetricsHistory(selectedInstanceId) : []

  const state = status?.state ?? 'idle'
  const isRunning = state === 'running'
  const isStarting = state === 'starting'

  const handleStop = () => {
    if (selectedInstanceId) stopInstance(selectedInstanceId)
  }

  // Auto-select first running instance if none selected
  useEffect(() => {
    if (!selectedInstanceId && ws.instances.length > 0) {
      const running = ws.instances.find((i) => i.state === 'running')
      if (running) ws.selectInstance(running.id)
    }
  }, [selectedInstanceId, ws.instances, ws.selectInstance])

  // Build throughput chart option
  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: {
      top: 30,
      right: 50,
      bottom: 30,
      left: 60,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e5e5e5',
      textStyle: { color: '#000000', fontSize: 12, fontFamily: 'JetBrains Mono' },
      axisPointer: { lineStyle: { color: '#e5e5e5' } },
    },
    legend: {
      data: [t('instance.prefill'), t('instance.decode')],
      top: 0,
      right: 0,
      textStyle: { color: '#a3a3a3', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 2,
    },
    xAxis: {
      type: 'category',
      data: metricsHistory.map((_: unknown, i: number) => i),
      show: false,
    },
    yAxis: [
      {
        type: 'value',
        name: `${t('instance.prefill')} / ${t('instance.decode')} tok/s`,
        nameTextStyle: { color: '#a3a3a3', fontSize: 10 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f5f5f5' } },
        axisLabel: { color: '#a3a3a3', fontSize: 10, fontFamily: 'JetBrains Mono' },
      },
      {
        type: 'value',
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#a3a3a3', fontSize: 10, fontFamily: 'JetBrains Mono' },
      },
    ],
    series: [
      {
        name: t('instance.prefill'),
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#10b981', width: 2 },
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.2)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0)' },
            ],
          },
        },
        data: metricsHistory.map((m: { prefill_throughput: number }) => m.prefill_throughput),
      },
      {
        name: t('instance.decode'),
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0)' },
            ],
          },
        },
        data: metricsHistory.map((m: { decode_throughput: number }) => m.decode_throughput),
      },
    ],
    animation: true,
    animationDuration: 300,
  }), [metricsHistory, t])

  const pageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  }

  return (
    <motion.div
      className="dashboard"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="dashboard-actions">
          {ws.instances.length > 0 && (
            <select
              className="input instance-select"
              value={selectedInstanceId || ''}
              onChange={(e) => ws.selectInstance(e.target.value)}
            >
              <option value="" disabled>{t('dashboard.selectInstance')}</option>
              {ws.instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.model || inst.id} — :{inst.config?.port ?? '?'} ({inst.state})
                </option>
              ))}
            </select>
          )}
          {selectedInstanceId && <StatusBadge state={state} />}
          {selectedInstanceId && (isRunning || isStarting) && (
            <motion.button
              className="btn btn-danger"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStop}
            >
              {t('dashboard.stopServer')}
            </motion.button>
          )}
        </div>
      </div>

      {/* No instance selected */}
      {!selectedInstanceId && (
        <div className="dashboard-empty">
          <div className="dashboard-empty__icon">⚡</div>
          <div className="dashboard-empty__title">{t('dashboard.noInstance.title')}</div>
          <div className="dashboard-empty__desc">
            {ws.instances.length > 0
              ? t('dashboard.noInstance.desc.select')
              : t('dashboard.noInstance.desc.create')}
          </div>
        </div>
      )}

      {/* GPU Monitor — always visible */}
      <GPUMonitor />

      {/* Error Banner */}
      {selectedInstanceId && lastError && (
        <motion.div
          className="error-banner"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <div className="error-banner-header">
            <span className="error-banner-title">{lastError.title}</span>
            <button className="error-banner-close" onClick={clearError}>×</button>
          </div>
          <p className="error-banner-desc">{lastError.description}</p>
          {lastError.suggestions.length > 0 && (
            <ul className="error-banner-suggestions">
              {lastError.suggestions.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </motion.div>
      )}

      {/* Metrics Grid */}
      {selectedInstanceId && (
        <>
          <div className="metrics-grid">
            {/* Gauges */}
            <div className="card gauge-card">
              <div className="card-header">
                <span className="card-title">{t('dashboard.prefillSpeed')}</span>
                <span className="card-subtitle">{t('dashboard.prefillDesc')}</span>
              </div>
              <AnimatedGauge
                value={metrics.prefill_throughput}
                max={5000}
                label={t('config.tokensPerSec')}
                unit="tok/s"
                color="#10b981"
              />
            </div>

            <div className="card gauge-card">
              <div className="card-header">
                <span className="card-title">{t('dashboard.decodeSpeed')}</span>
                <span className="card-subtitle">{t('dashboard.decodeDesc')}</span>
              </div>
              <AnimatedGauge
                value={metrics.decode_throughput}
                max={500}
                label={t('config.tokensPerSec')}
                unit="tok/s"
                color="#3b82f6"
              />
            </div>

            {/* Info Cards */}
            <div className="card info-card">
              <div className="card-header">
                <span className="card-title">{t('dashboard.serverInfo')}</span>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">{t('dashboard.model')}</span>
                  <span className="info-value text-mono">{status?.model || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('dashboard.state')}</span>
                  <span className="info-value">{state}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('dashboard.pid')}</span>
                  <span className="info-value text-mono">{status?.pid || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('dashboard.loadTime')}</span>
                  <span className="info-value text-mono">
                    {status?.load_time ? `${status.load_time.toFixed(1)}s` : '—'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('dashboard.activeRequests')}</span>
                  <span className="info-value text-mono">{metrics.requests_active}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('dashboard.waiting')}</span>
                  <span className="info-value text-mono">{metrics.requests_waiting}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Throughput Chart */}
          <div className="card chart-card">
            <div className="card-header">
              <span className="card-title">{t('dashboard.throughput')}</span>
              <span className="card-subtitle">{t('dashboard.throughputDesc')}</span>
            </div>
            {metricsHistory.length > 0 ? (
              <ReactECharts
                option={chartOption}
                style={{ height: 280 }}
                opts={{ renderer: 'canvas' }}
              />
            ) : (
              <div className="chart-empty">
                {t('dashboard.waitingMetrics')}
              </div>
            )}
          </div>

          {/* GPU Cache */}
          <div className="card gpu-card">
            <div className="card-header">
              <span className="card-title">{t('dashboard.gpuCache')}</span>
              <span className="text-mono text-primary">
                {(metrics.gpu_cache_usage * 100).toFixed(1)}%
              </span>
            </div>
            <div className="gpu-bar-container">
              <motion.div
                className="gpu-bar-fill"
                animate={{ width: `${metrics.gpu_cache_usage * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  background: metrics.gpu_cache_usage > 0.9
                    ? '#ef4444'
                    : metrics.gpu_cache_usage > 0.75
                      ? '#f59e0b'
                      : '#10b981',
                }}
              />
            </div>
          </div>
        </>
      )}

      <style>{`
        .dashboard {
          max-width: 1200px;
        }
        .dashboard-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 32px;
        }
        .dashboard-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .instance-select {
          min-width: 280px;
          max-width: 360px;
          font-size: 13px;
          width: auto;
        }
        .dashboard-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
        }
        .dashboard-empty__icon {
          font-size: 40px;
          margin-bottom: 16px;
        }
        .dashboard-empty__title {
          font-size: 18px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 8px;
        }
        .dashboard-empty__desc {
          font-size: 14px;
          color: var(--mute);
          text-align: center;
        }
        .error-banner {
          background: var(--error-soft);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-md);
          padding: 20px;
          margin-bottom: 24px;
          overflow: hidden;
        }
        .error-banner-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .error-banner-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--error);
        }
        .error-banner-close {
          background: none;
          border: none;
          color: var(--error);
          font-size: 20px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
        }
        .error-banner-desc {
          font-size: 13px;
          color: var(--body);
          margin-bottom: 12px;
        }
        .error-banner-suggestions {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .error-banner-suggestions li {
          font-size: 12px;
          color: var(--body);
          padding-left: 16px;
          position: relative;
        }
        .error-banner-suggestions li::before {
          content: '→';
          position: absolute;
          left: 0;
          color: var(--error);
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        .gauge-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 24px;
        }
        .gauge-card .card-header {
          width: 100%;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          margin-bottom: 8px;
        }
        .info-card {
          padding: 24px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .info-label {
          font-size: 11px;
          color: var(--mute);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .info-value {
          font-size: 14px;
          color: var(--ink);
          font-weight: 500;
        }
        .chart-card {
          margin-bottom: 20px;
        }
        .chart-empty {
          height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--mute);
          font-size: 13px;
        }
        .gpu-card {
          margin-bottom: 20px;
        }
        .gpu-bar-container {
          height: 8px;
          background: var(--hairline);
          border-radius: 4px;
          overflow: hidden;
        }
        .gpu-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: background 0.3s;
        }
        @media (max-width: 900px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </motion.div>
  )
}

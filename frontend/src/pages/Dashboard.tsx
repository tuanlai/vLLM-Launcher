import { motion } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import AnimatedGauge from '../components/AnimatedGauge'
import StatusBadge from '../components/StatusBadge'
import type { UseWebSocketReturn } from '../api/websocket'

interface DashboardProps {
  ws: UseWebSocketReturn
}

export default function Dashboard({ ws }: DashboardProps) {
  const { status, metrics, metricsHistory, lastError, stopServer, clearError } = ws

  const isRunning = status.state === 'running'
  const isStarting = status.state === 'starting'

  // Build throughput chart option
  const chartOption = {
    backgroundColor: 'transparent',
    grid: {
      top: 30,
      right: 20,
      bottom: 30,
      left: 55,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1a1a',
      borderColor: '#2a2a2a',
      textStyle: { color: '#f2f2f2', fontSize: 12, fontFamily: 'JetBrains Mono' },
      axisPointer: { lineStyle: { color: '#2a2a2a' } },
    },
    legend: {
      data: ['Prefill', 'Decode'],
      top: 0,
      right: 0,
      textStyle: { color: '#8b949e', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 2,
    },
    xAxis: {
      type: 'category',
      data: metricsHistory.map((_, i) => i),
      show: false,
    },
    yAxis: {
      type: 'value',
      name: 'tokens/s',
      nameTextStyle: { color: '#8b949e', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1a1a1a' } },
      axisLabel: { color: '#8b949e', fontSize: 10, fontFamily: 'JetBrains Mono' },
    },
    series: [
      {
        name: 'Prefill',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00d992', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 217, 146, 0.2)' },
              { offset: 1, color: 'rgba(0, 217, 146, 0)' },
            ],
          },
        },
        data: metricsHistory.map((m) => m.prefill_throughput),
      },
      {
        name: 'Decode',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
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
        data: metricsHistory.map((m) => m.decode_throughput),
      },
    ],
    animation: true,
    animationDuration: 300,
  }

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
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Monitor vLLM server performance in real-time</p>
        </div>
        <div className="dashboard-actions">
          <StatusBadge state={status.state} />
          {(isRunning || isStarting) && (
            <motion.button
              className="btn btn-danger"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={stopServer}
            >
              Stop Server
            </motion.button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {lastError && (
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
              {lastError.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </motion.div>
      )}

      {/* Metrics Grid */}
      <div className="metrics-grid">
        {/* Gauges */}
        <div className="card gauge-card">
          <div className="card-header">
            <span className="card-title">Prefill Speed</span>
            <span className="card-subtitle">Prompt processing</span>
          </div>
          <AnimatedGauge
            value={metrics.prefill_throughput}
            max={5000}
            label="tokens/s"
            unit="tok/s"
            color="#00d992"
          />
        </div>

        <div className="card gauge-card">
          <div className="card-header">
            <span className="card-title">Decode Speed</span>
            <span className="card-subtitle">Token generation</span>
          </div>
          <AnimatedGauge
            value={metrics.decode_throughput}
            max={500}
            label="tokens/s"
            unit="tok/s"
            color="#3b82f6"
          />
        </div>

        {/* Info Cards */}
        <div className="card info-card">
          <div className="card-header">
            <span className="card-title">Server Info</span>
          </div>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Model</span>
              <span className="info-value text-mono">{status.model || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">State</span>
              <span className="info-value">{status.state}</span>
            </div>
            <div className="info-item">
              <span className="info-label">PID</span>
              <span className="info-value text-mono">{status.pid || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Load Time</span>
              <span className="info-value text-mono">
                {status.load_time ? `${status.load_time.toFixed(1)}s` : '—'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Active Requests</span>
              <span className="info-value text-mono">{metrics.requests_active}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Waiting</span>
              <span className="info-value text-mono">{metrics.requests_waiting}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Throughput Chart */}
      <div className="card chart-card">
        <div className="card-header">
          <span className="card-title">Throughput Over Time</span>
          <span className="card-subtitle">Real-time performance metrics</span>
        </div>
        {metricsHistory.length > 0 ? (
          <ReactECharts
            option={chartOption}
            style={{ height: 280 }}
            opts={{ renderer: 'canvas' }}
          />
        ) : (
          <div className="chart-empty">
            Waiting for metrics data...
          </div>
        )}
      </div>

      {/* GPU Cache */}
      <div className="card gpu-card">
        <div className="card-header">
          <span className="card-title">GPU Cache Usage</span>
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
                  : '#00d992',
            }}
          />
        </div>
      </div>

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
        .dashboard-actions {
          display: flex;
          align-items: center;
          gap: 12px;
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

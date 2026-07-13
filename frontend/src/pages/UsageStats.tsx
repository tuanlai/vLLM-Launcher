import * as React from 'react'
import { motion } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import { useI18n } from '../i18n'
import {
  fetchUsageToday,
  fetchDailyTrend,
  fetchModels,
  fetchIpDetail,
  resetUsage,
} from '../api/usage'
import type { UsageTodayResponse, UsageDailyRow, UsageIpDetailResponse } from '../api/types'

export default function UsageStats() {
  const { t } = useI18n()
  const [today, setToday] = React.useState<UsageTodayResponse | null>(null)
  const [trendData, setTrendData] = React.useState<UsageDailyRow[]>([])
  const [models, setModels] = React.useState<string[]>([])
  const [selectedModel, setSelectedModel] = React.useState<string>('')
  const [ipDetail, setIpDetail] = React.useState<UsageIpDetailResponse | null>(null)
  const [dateRange, setDateRange] = React.useState<{ start: string; end: string }>({
    start: daysAgo(30),
    end: todayStr(),
  })
  const [loading, setLoading] = React.useState(true)

  // Load data
  React.useEffect(() => {
    load()
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [todayData, modelsData] = await Promise.all([
        fetchUsageToday(),
        fetchModels(),
      ])
      setToday(todayData)
      setModels(modelsData)
      await loadTrend()
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTrend = React.useCallback(async () => {
    const data = await fetchDailyTrend(undefined, selectedModel || undefined, dateRange.start, dateRange.end)
    setTrendData(data)
  }, [selectedModel, dateRange])

  // Reload trend when model/date changes
  React.useEffect(() => {
    loadTrend()
  }, [loadTrend])

  const handleIpClick = React.useCallback(async (ip: string) => {
    const detail = await fetchIpDetail(ip, dateRange.start, dateRange.end)
    setIpDetail(detail)
  }, [dateRange])

  const handleReset = async () => {
    if (confirm(t('usage.resetConfirm'))) {
      await resetUsage()
      await load()
    }
  }

  // Chart
  const chartOption = React.useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { top: 30, right: 50, bottom: 30, left: 60 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e5e5e5',
      textStyle: { color: '#000', fontSize: 12, fontFamily: 'JetBrains Mono' },
    },
    legend: {
      data: [t('usage.inputTokens'), t('usage.outputTokens')],
      top: 0, left: 'center',
      textStyle: { color: '#a3a3a3', fontSize: 11 },
      itemWidth: 12, itemHeight: 2,
    },
    xAxis: {
      type: 'category',
      data: trendData.map((r) => r.date.slice(5)),
      axisLabel: { color: '#a3a3a3', fontSize: 10, fontFamily: 'JetBrains Mono' },
    },
    yAxis: [
      {
        type: 'value',
        name: t('usage.inputTokens'),
        nameTextStyle: { color: '#10b981', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f5f5f5' } },
        axisLabel: { color: '#10b981', fontSize: 10, fontFamily: 'JetBrains Mono', formatter: formatToken },
      },
      {
        type: 'value',
        name: t('usage.outputTokens'),
        nameTextStyle: { color: '#3b82f6', fontSize: 10 },
        splitLine: { show: false },
        axisLabel: { color: '#3b82f6', fontSize: 10, fontFamily: 'JetBrains Mono', formatter: formatToken },
      },
    ],
    series: [
      {
        name: t('usage.inputTokens'),
        type: 'bar',
        yAxisIndex: 0,
        itemStyle: { color: '#10b981', borderRadius: [2, 2, 0, 0] },
        data: trendData.map((r) => r.prompt_tokens),
      },
      {
        name: t('usage.outputTokens'),
        type: 'bar',
        yAxisIndex: 1,
        itemStyle: { color: '#3b82f6', borderRadius: [2, 2, 0, 0] },
        data: trendData.map((r) => r.generation_tokens),
      },
    ],
    animation: false,
  }), [trendData, t])

  if (loading) {
    return <div className="usage-loading">{t('usage.loading')}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <div className="usage-header">
        <div>
          <h1 className="page-title">{t('usage.title')}</h1>
          <p className="page-subtitle">{t('usage.subtitle')}</p>
        </div>
        <button className="btn btn-ghost" onClick={handleReset} style={{ color: 'var(--error)' }}>
          {t('usage.resetToday')}
        </button>
      </div>

      {/* Today's Summary */}
      <div className="card usage-today-card">
        <div className="card-header">
          <span className="card-title">{t('usage.today')}</span>
          <span className="card-subtitle">{today?.ips ? today.date : ''}</span>
        </div>
        {!today || today.ips.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>
            {t('usage.noData')}
          </div>
        ) : (
          <div className="usage-ip-table">
            <div className="usage-ip-table-header">
              <span>{t('usage.ip')}</span>
              <span>{t('usage.inputTokens')}</span>
              <span>{t('usage.outputTokens')}</span>
              <span>{t('usage.total')}</span>
              <span>{t('usage.requests')}</span>
              <span>{t('usage.models')}</span>
            </div>
            {today.ips.map((entry) => (
              <div
                key={entry.ip}
                className="usage-ip-table-row"
                onClick={() => handleIpClick(entry.ip)}
                style={{ cursor: 'pointer' }}
              >
                <span className="usage-ip">{entry.ip}</span>
                <span>{formatToken(entry.prompt_tokens)}</span>
                <span>{formatToken(entry.generation_tokens)}</span>
                <span>{formatToken(entry.prompt_tokens + entry.generation_tokens)}</span>
                <span>{entry.requests}</span>
                <span className="usage-models-tag">{entry.models}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trend Chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('usage.trend')}</span>
          <div className="usage-filters">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))}
              className="input"
              style={{ fontSize: 12 }}
            />
            <span style={{ color: 'var(--mute)' }}>→</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))}
              className="input"
              style={{ fontSize: 12 }}
            />
            {models.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="input"
                style={{ fontSize: 12, width: 'auto' }}
              >
                <option value="">{t('usage.allModels')}</option>
                {models.map((m) => (
                  <option key={m} value={m}>{modelShort(m)}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        {trendData.length > 0 ? (
          <ReactECharts option={chartOption} style={{ height: 280 }} opts={{ renderer: 'canvas' }} />
        ) : (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', fontSize: 13 }}>
            {t('usage.noTrend')}
          </div>
        )}
      </div>

      {/* IP Detail */}
      {ipDetail && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              {t('usage.ipDetail')}: {ipDetail.ip}
            </span>
            <span className="card-subtitle">
              {formatToken(ipDetail.total_prompt_tokens + ipDetail.total_generation_tokens)} {t('usage.totalTokens')}
            </span>
          </div>
          <div className="usage-ip-detail-grid">
            <div className="usage-stat">
              <span className="usage-stat-label">{t('usage.inputTokens')}</span>
              <span className="usage-stat-value text-mono">{formatToken(ipDetail.total_prompt_tokens)}</span>
            </div>
            <div className="usage-stat">
              <span className="usage-stat-label">{t('usage.outputTokens')}</span>
              <span className="usage-stat-value text-mono">{formatToken(ipDetail.total_generation_tokens)}</span>
            </div>
            <div className="usage-stat">
              <span className="usage-stat-label">{t('usage.requests')}</span>
              <span className="usage-stat-value text-mono">{ipDetail.total_requests}</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .usage-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 32px;
        }
        .usage-today-card { margin-bottom: 20px; }
        .usage-loading {
          padding: 40px; text-align: center; color: var(--mute);
        }
        .usage-ip-table {
          overflow-x: auto;
        }
        .usage-ip-table-header {
          display: grid;
          grid-template-columns: 140px 100px 100px 100px 70px 1fr;
          gap: 8px;
          padding: 8px 16px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--mute);
          border-bottom: 1px solid var(--hairline);
        }
        .usage-ip-table-row {
          display: grid;
          grid-template-columns: 140px 100px 100px 100px 70px 1fr;
          gap: 8px;
          padding: 10px 16px;
          font-size: 13px;
          font-family: var(--font-mono);
          color: var(--body);
          border-bottom: 1px solid var(--hairline);
          align-items: center;
        }
        .usage-ip-table-row:last-child { border-bottom: none; }
        .usage-ip-table-row:hover { background: var(--surface-hover); }
        .usage-ip { font-weight: 600; color: var(--ink); }
        .usage-models-tag {
          font-size: 11px;
          color: var(--mute);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .usage-filters {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .usage-ip-detail-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          padding: 16px 0;
        }
        .usage-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .usage-stat-label {
          font-size: 11px;
          color: var(--mute);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .usage-stat-value {
          font-size: 20px;
          font-weight: 600;
          color: var(--ink);
        }
      `}</style>
    </motion.div>
  )
}

// Helpers
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function formatToken(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

function modelShort(path: string): string {
  return path.split('/').pop() || path
}

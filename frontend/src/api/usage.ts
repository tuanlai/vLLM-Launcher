import { API_BASE } from './config'
import type { UsageTodayResponse, UsageDailyRow, UsageIpDetailResponse } from './types'

export async function fetchUsageToday(): Promise<UsageTodayResponse> {
  const res = await fetch(`${API_BASE}/api/usage/today`)
  if (!res.ok) throw new Error('Failed to fetch usage')
  return res.json()
}

export async function fetchDailyTrend(
  ip?: string,
  model?: string,
  startDate?: string,
  endDate?: string,
): Promise<UsageDailyRow[]> {
  const params = new URLSearchParams()
  if (ip) params.set('ip', ip)
  if (model) params.set('model', model)
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  const res = await fetch(`${API_BASE}/api/usage/daily-trend?${params}`)
  if (!res.ok) throw new Error('Failed to fetch trend')
  return res.json()
}

export async function fetchModels(date?: string): Promise<string[]> {
  const params = date ? `?date=${date}` : ''
  const res = await fetch(`${API_BASE}/api/usage/models${params}`)
  if (!res.ok) throw new Error('Failed to fetch models')
  const data = await res.json()
  return data.models
}

export async function fetchIpDetail(
  ip: string,
  startDate?: string,
  endDate?: string,
): Promise<UsageIpDetailResponse> {
  const params = new URLSearchParams()
  params.set('ip', ip)
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  const res = await fetch(`${API_BASE}/api/usage/by-ip?${params}`)
  if (!res.ok) throw new Error('Failed to fetch IP detail')
  return res.json()
}

export async function resetUsage(date?: string): Promise<void> {
  const params = date ? `?date=${date}` : ''
  const res = await fetch(`${API_BASE}/api/usage/reset${params}`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reset usage')
}

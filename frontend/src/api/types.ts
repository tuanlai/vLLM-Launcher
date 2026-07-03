export interface LogEntry {
  timestamp: number
  level: string
  message: string
  stream: string
}

export interface Metrics {
  prefill_throughput: number
  decode_throughput: number
  total_tokens: number
  prompt_tokens: number
  generation_tokens: number
  requests_active: number
  requests_waiting: number
  gpu_cache_usage: number
  timestamp: number
}

export interface InstanceStatus {
  id: string
  state: string
  pid: number | null
  start_time: string | null
  model: string | null
  model_loaded: boolean
  load_time: number | null
  last_error: string | null
  metrics: Metrics
  config: Record<string, any> | null
}

export interface ErrorData {
  error_type: string
  message: string
  title: string
  description: string
  suggestions: string[]
  severity: string
}

export interface WSMessage {
  type: 'log' | 'metrics' | 'status' | 'error'
  data: LogEntry | Metrics | InstanceStatus | ErrorData
}

export const DEFAULT_METRICS: Metrics = {
  prefill_throughput: 0,
  decode_throughput: 0,
  total_tokens: 0,
  prompt_tokens: 0,
  generation_tokens: 0,
  requests_active: 0,
  requests_waiting: 0,
  gpu_cache_usage: 0,
  timestamp: 0,
}

// Shared types used across multiple components

export interface ModelInfo {
  name: string
  path: string
  size_gb: number
  format: string
  param_count: string | null
}

export interface VRAMCheckResult {
  total_vram_gb: number
  used_vram_gb: number
  free_vram_gb: number
  estimated_gb: number
  feasible: boolean
  suggestion: string | null
  gpu_name?: string
}

export interface Preset {
  name: string
  config: Record<string, any>
  created_at: string
  updated_at?: string
}

export interface GPUStats {
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

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
}

// vLLM capabilities detected at startup
export interface Capabilities {
  quantization_methods: string[] | null
  load_formats: string[] | null
  dtypes: string[] | null
  kv_cache_dtypes: string[] | null
  tool_call_parsers: string[] | null
}

// Token Usage types
export interface UsageByIP {
  ip: string
  prompt_tokens: number
  generation_tokens: number
  requests: number
  models: string
}

export interface UsageDailyRow {
  date: string
  prompt_tokens: number
  generation_tokens: number
  requests: number
}

export interface UsageTodayResponse {
  date: string
  ips: UsageByIP[]
}

export interface UsageIpDetailResponse {
  ip: string
  date_range: { start: string | null; end: string | null }
  total_prompt_tokens: number
  total_generation_tokens: number
  total_requests: number
  daily: UsageDailyRow[]
}

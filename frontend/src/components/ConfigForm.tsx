import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import ModelSelector from './ModelSelector'
import VRAMIndicator from './VRAMIndicator'
import PresetManager from './PresetManager'
import type { VRAMCheckResult } from './ModelSelector'

interface ConfigFormProps {
  onSubmit: (config: Record<string, any>) => void
  disabled?: boolean
}

interface ConfigState {
  model: string
  port: number
  host: string
  tensor_parallel_size: number
  gpu_memory_utilization: number
  max_model_len: string
  quantization: string
  dtype: string
  kv_cache_dtype: string
  trust_remote_code: boolean
  enforce_eager: boolean
  enable_chunked_prefill: boolean
  enable_auto_tool_choice: boolean
  tool_call_parser: string
  reasoning_parser: string
  speculative_config: string
  seed: string
  max_num_seqs: string
  max_num_batched_tokens: string
  swap_space: number
  block_size: string
  enable_prefix_caching: string
  disable_log_stats: boolean
  load_format: string
  lora: string
  extra_args: string
}

const DEFAULTS: ConfigState = {
  model: '',
  port: 8000,
  host: '0.0.0.0',
  tensor_parallel_size: 1,
  gpu_memory_utilization: 0.9,
  max_model_len: '',
  quantization: '',
  dtype: '',
  kv_cache_dtype: 'auto',
  trust_remote_code: false,
  enforce_eager: false,
  enable_chunked_prefill: false,
  enable_auto_tool_choice: false,
  tool_call_parser: '',
  reasoning_parser: '',
  speculative_config: '',
  seed: '',
  max_num_seqs: '',
  max_num_batched_tokens: '',
  swap_space: 4,
  block_size: '',
  enable_prefix_caching: 'auto',
  disable_log_stats: false,
  load_format: 'auto',
  lora: '',
  extra_args: '',
}

function buildCommand(config: ConfigState): string {
  const parts: string[] = ['vllm', 'serve']

  if (!config.model) {
    return parts.join(' ') + ' <model>'
  }

  parts.push(config.model)

  if (config.port !== DEFAULTS.port) parts.push('--port', String(config.port))
  if (config.host !== DEFAULTS.host) parts.push('--host', config.host)
  if (config.tensor_parallel_size !== DEFAULTS.tensor_parallel_size)
    parts.push('--tensor-parallel-size', String(config.tensor_parallel_size))
  if (config.gpu_memory_utilization !== DEFAULTS.gpu_memory_utilization)
    parts.push('--gpu-memory-utilization', String(config.gpu_memory_utilization))
  if (config.max_model_len) parts.push('--max-model-len', config.max_model_len)
  if (config.quantization) parts.push('--quantization', config.quantization)
  if (config.dtype) parts.push('--dtype', config.dtype)
  if (config.kv_cache_dtype !== DEFAULTS.kv_cache_dtype)
    parts.push('--kv-cache-dtype', config.kv_cache_dtype)
  if (config.trust_remote_code) parts.push('--trust-remote-code')
  if (config.enforce_eager) parts.push('--enforce-eager')
  if (config.enable_chunked_prefill) parts.push('--enable-chunked-prefill')
  if (config.enable_auto_tool_choice) parts.push('--enable-auto-tool-choice')
  if (config.tool_call_parser)
    parts.push('--tool-call-parser', config.tool_call_parser)
  if (config.reasoning_parser)
    parts.push('--reasoning-parser', config.reasoning_parser)
  if (config.speculative_config)
    parts.push('--speculative-config', `'${config.speculative_config}'`)
  if (config.seed) parts.push('--seed', config.seed)
  if (config.max_num_seqs) parts.push('--max-num-seqs', config.max_num_seqs)
  if (config.max_num_batched_tokens)
    parts.push('--max-num-batched-tokens', config.max_num_batched_tokens)
  if (config.swap_space !== DEFAULTS.swap_space)
    parts.push('--swap-space', String(config.swap_space))
  if (config.block_size) parts.push('--block-size', config.block_size)

  if (config.enable_prefix_caching === 'true') {
    parts.push('--enable-prefix-caching')
  } else if (config.enable_prefix_caching === 'false') {
    parts.push('--no-enable-prefix-caching')
  }

  if (config.disable_log_stats) parts.push('--disable-log-stats')
  if (config.load_format !== DEFAULTS.load_format)
    parts.push('--load-format', config.load_format)
  if (config.lora) parts.push('--lora', config.lora)

  if (config.extra_args.trim()) {
    parts.push(config.extra_args.trim())
  }

  return parts.join(' ')
}

function Toggle({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`toggle ${active ? 'active' : ''}`}
      onClick={onClick}
    />
  )
}

function TriStateToggle({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const cycle = () => {
    if (value === 'auto') onChange('true')
    else if (value === 'true') onChange('false')
    else onChange('auto')
  }

  const label = value === 'auto' ? 'Auto' : value === 'true' ? 'Yes' : 'No'

  return (
    <button type="button" className="tri-state-toggle" onClick={cycle}>
      <span
        className={`tri-state-dot ${value === 'true' ? 'on' : value === 'false' ? 'off' : 'auto'}`}
      />
      <span className="tri-state-label">{label}</span>
    </button>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
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

function CopyIcon() {
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
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="section">
      <div className="section-header" onClick={() => setOpen(!open)}>
        <span className="section-title">{title}</span>
        <span className="section-toggle">
          <ChevronIcon open={open} />
        </span>
      </div>
      {open && <div className="section-content">{children}</div>}
    </div>
  )
}

export default function ConfigForm({ onSubmit, disabled }: ConfigFormProps) {
  const [config, setConfig] = useState<ConfigState>({ ...DEFAULTS })
  const [vramResult, setVramResult] = useState<VRAMCheckResult | null>(null)
  const [copied, setCopied] = useState(false)

  const update = <K extends keyof ConfigState>(key: K, value: ConfigState[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const command = useMemo(() => buildCommand(config), [config])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback: select text
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitConfig: Record<string, any> = {
      model: config.model,
      port: config.port,
      host: config.host,
      tensor_parallel_size: config.tensor_parallel_size,
      gpu_memory_utilization: config.gpu_memory_utilization,
      max_model_len: config.max_model_len ? parseInt(config.max_model_len) : null,
      quantization: config.quantization || null,
      dtype: config.dtype || null,
      kv_cache_dtype: config.kv_cache_dtype === 'auto' ? null : config.kv_cache_dtype,
      trust_remote_code: config.trust_remote_code,
      enforce_eager: config.enforce_eager,
      enable_chunked_prefill: config.enable_chunked_prefill,
      enable_auto_tool_choice: config.enable_auto_tool_choice,
      tool_call_parser: config.tool_call_parser || null,
      reasoning_parser: config.reasoning_parser || null,
      speculative_config: config.speculative_config || null,
      seed: config.seed ? parseInt(config.seed) : null,
      max_num_seqs: config.max_num_seqs ? parseInt(config.max_num_seqs) : null,
      max_num_batched_tokens: config.max_num_batched_tokens
        ? parseInt(config.max_num_batched_tokens)
        : null,
      swap_space: config.swap_space,
      block_size: config.block_size ? parseInt(config.block_size) : null,
      enable_prefix_caching:
        config.enable_prefix_caching === 'auto'
          ? null
          : config.enable_prefix_caching === 'true',
      disable_log_stats: config.disable_log_stats,
      load_format: config.load_format,
      lora: config.lora || null,
      extra_args: config.extra_args || '',
    }
    onSubmit(submitConfig)
  }

  return (
    <form onSubmit={handleSubmit} className="config-form">
      {/* Command Preview */}
      <div className="command-preview">
        <code className="command-text">{command}</code>
        <button
          type="button"
          className="copy-btn btn btn-ghost"
          onClick={handleCopy}
          title="Copy command"
        >
          {copied ? 'Copied!' : <CopyIcon />}
        </button>
      </div>

      {/* Presets */}
      <div className="section">
        <PresetManager
          currentConfig={config}
          onLoad={(loadedConfig) =>
            setConfig((prev) => ({ ...prev, ...loadedConfig }))
          }
        />
      </div>

      {/* Common Parameters */}
      <Section title="Common Parameters" defaultOpen={true}>
        <div className="form-group">
          <ModelSelector
            value={config.model}
            onChange={(model) => update('model', model)}
            onVRAMCheck={(result) => setVramResult(result)}
          />
          <VRAMIndicator result={vramResult} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Port</label>
            <input
              type="number"
              className="input"
              value={config.port}
              onChange={(e) => update('port', parseInt(e.target.value) || 8000)}
            />
          </div>
          <div className="form-group">
            <label className="input-label">Host</label>
            <input
              type="text"
              className="input"
              value={config.host}
              onChange={(e) => update('host', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Tensor Parallel Size</label>
            <div className="slider-container">
              <input
                type="range"
                className="slider"
                min="1"
                max="8"
                step="1"
                value={config.tensor_parallel_size}
                onChange={(e) =>
                  update('tensor_parallel_size', parseInt(e.target.value))
                }
              />
              <span className="slider-value">{config.tensor_parallel_size}</span>
            </div>
          </div>
          <div className="form-group">
            <label className="input-label">GPU Memory Utilization</label>
            <div className="slider-container">
              <input
                type="range"
                className="slider"
                min="0.5"
                max="1"
                step="0.05"
                value={config.gpu_memory_utilization}
                onChange={(e) =>
                  update('gpu_memory_utilization', parseFloat(e.target.value))
                }
              />
              <span className="slider-value">
                {(config.gpu_memory_utilization * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Max Model Length</label>
            <input
              type="number"
              className="input"
              placeholder="Auto"
              value={config.max_model_len}
              onChange={(e) => update('max_model_len', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="input-label">Seed</label>
            <input
              type="number"
              className="input"
              placeholder="Random"
              value={config.seed}
              onChange={(e) => update('seed', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Quantization</label>
            <select
              className="input"
              value={config.quantization}
              onChange={(e) => update('quantization', e.target.value)}
            >
              <option value="">None</option>
              <option value="awq">AWQ</option>
              <option value="gptq">GPTQ</option>
              <option value="squeezellm">SqueezeLLM</option>
              <option value="fp8">FP8</option>
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">Data Type</label>
            <select
              className="input"
              value={config.dtype}
              onChange={(e) => update('dtype', e.target.value)}
            >
              <option value="">Auto</option>
              <option value="float16">float16</option>
              <option value="bfloat16">bfloat16</option>
              <option value="float32">float32</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">KV Cache Dtype</label>
            <select
              className="input"
              value={config.kv_cache_dtype}
              onChange={(e) => update('kv_cache_dtype', e.target.value)}
            >
              <option value="auto">auto</option>
              <option value="fp8_e4m3">fp8_e4m3</option>
              <option value="fp8_e5m2">fp8_e5m2</option>
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">Max Num Batched Tokens</label>
            <input
              type="number"
              className="input"
              placeholder="Default"
              value={config.max_num_batched_tokens}
              onChange={(e) => update('max_num_batched_tokens', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Trust Remote Code</label>
            <Toggle
              active={config.trust_remote_code}
              onClick={() =>
                update('trust_remote_code', !config.trust_remote_code)
              }
            />
          </div>
          <div className="form-group">
            <label className="input-label">Enforce Eager</label>
            <Toggle
              active={config.enforce_eager}
              onClick={() => update('enforce_eager', !config.enforce_eager)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Enable Chunked Prefill</label>
            <Toggle
              active={config.enable_chunked_prefill}
              onClick={() =>
                update('enable_chunked_prefill', !config.enable_chunked_prefill)
              }
            />
          </div>
          <div className="form-group">
            <label className="input-label">Enable Auto Tool Choice</label>
            <Toggle
              active={config.enable_auto_tool_choice}
              onClick={() =>
                update('enable_auto_tool_choice', !config.enable_auto_tool_choice)
              }
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Tool Call Parser</label>
            <select
              className="input"
              value={config.tool_call_parser}
              onChange={(e) => update('tool_call_parser', e.target.value)}
            >
              <option value="">None</option>
              <option value="hermes">hermes</option>
              <option value="llama3_json">llama3_json</option>
              <option value="mistral">mistral</option>
              <option value="internlm">internlm</option>
              <option value="qwen3_coder">qwen3_coder</option>
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">Reasoning Parser</label>
            <select
              className="input"
              value={config.reasoning_parser}
              onChange={(e) => update('reasoning_parser', e.target.value)}
            >
              <option value="">None</option>
              <option value="deepseek_r1">deepseek_r1</option>
              <option value="qwen3">qwen3</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="input-label">Speculative Config</label>
          <input
            type="text"
            className="input"
            placeholder='e.g. {"model": "path/to/draft", "num_speculative_tokens": 5}'
            value={config.speculative_config}
            onChange={(e) => update('speculative_config', e.target.value)}
          />
        </div>
      </Section>

      {/* Performance Tuning */}
      <Section title="Performance Tuning" defaultOpen={false}>
        <div className="form-group">
          <label className="input-label">Max Num Seqs</label>
          <input
            type="number"
            className="input"
            placeholder="Default"
            value={config.max_num_seqs}
            onChange={(e) => update('max_num_seqs', e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Swap Space (GB)</label>
            <input
              type="number"
              className="input"
              value={config.swap_space}
              onChange={(e) =>
                update('swap_space', parseInt(e.target.value) || 4)
              }
            />
          </div>
          <div className="form-group">
            <label className="input-label">Block Size</label>
            <input
              type="number"
              className="input"
              placeholder="Default"
              value={config.block_size}
              onChange={(e) => update('block_size', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Enable Prefix Caching</label>
            <TriStateToggle
              value={config.enable_prefix_caching}
              onChange={(v) => update('enable_prefix_caching', v)}
            />
          </div>
          <div className="form-group">
            <label className="input-label">Disable Log Stats</label>
            <Toggle
              active={config.disable_log_stats}
              onClick={() =>
                update('disable_log_stats', !config.disable_log_stats)
              }
            />
          </div>
        </div>

        <div className="form-group">
          <label className="input-label">Load Format</label>
          <select
            className="input"
            value={config.load_format}
            onChange={(e) => update('load_format', e.target.value)}
          >
            <option value="auto">auto</option>
            <option value="pt">pt</option>
            <option value="safetensors">safetensors</option>
            <option value="npcaches">npcaches</option>
            <option value="dummy">dummy</option>
          </select>
        </div>
      </Section>

      {/* Advanced */}
      <Section title="Advanced" defaultOpen={false}>
        <div className="form-group">
          <label className="input-label">LoRA</label>
          <input
            type="text"
            className="input"
            placeholder="LoRA adapter path or name"
            value={config.lora}
            onChange={(e) => update('lora', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="input-label">Additional Arguments</label>
          <textarea
            className="input"
            placeholder="--enforce-eager --disable-log-requests"
            value={config.extra_args}
            onChange={(e) => update('extra_args', e.target.value)}
            rows={3}
          />
        </div>
      </Section>

      {/* Submit */}
      <motion.button
        type="submit"
        className="btn btn-primary submit-btn"
        disabled={disabled || !config.model}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <PlayIcon />
        Launch vLLM
      </motion.button>

      <style>{`
        .config-form {
          max-width: 800px;
        }
        .command-preview {
          background: var(--canvas-softer);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          padding: 16px;
          font-family: var(--font-mono);
          font-size: 12px;
          position: relative;
          margin-bottom: 24px;
          word-break: break-all;
          line-height: 1.6;
        }
        .command-text {
          display: block;
          padding-right: 40px;
          white-space: pre-wrap;
        }
        .copy-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 4px 8px;
          font-size: 11px;
        }
        .copy-btn svg {
          width: 14px;
          height: 14px;
        }
        .section {
          margin-bottom: 24px;
        }
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          padding: 8px 0;
          border-bottom: 1px solid var(--hairline);
          user-select: none;
        }
        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
        }
        .section-toggle {
          font-size: 11px;
          color: var(--mute);
          display: flex;
          align-items: center;
        }
        .section-content {
          padding-top: 16px;
        }
        .tri-state-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--ink);
          transition: all 0.15s ease;
        }
        .tri-state-toggle:hover {
          border-color: var(--hairline-soft);
        }
        .tri-state-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          transition: background 0.15s ease;
        }
        .tri-state-dot.auto {
          background: var(--mute);
        }
        .tri-state-dot.on {
          background: var(--success);
        }
        .tri-state-dot.off {
          background: var(--error);
        }
        .tri-state-label {
          font-weight: 500;
          min-width: 28px;
          text-align: center;
        }
        .submit-btn {
          width: 100%;
          justify-content: center;
          padding: 14px;
          font-size: 14px;
          margin-top: 8px;
        }
      `}</style>
    </form>
  )
}

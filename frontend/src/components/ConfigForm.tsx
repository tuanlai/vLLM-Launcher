import { useState } from 'react'
import { motion } from 'framer-motion'

interface ConfigFormProps {
  onSubmit: (config: Record<string, any>) => void
  disabled?: boolean
}

const PRESETS = [
  { name: 'Small Model (7B)', model: 'meta-llama/Llama-2-7b-chat-hf', tp: 1, mem: 0.9 },
  { name: 'Medium Model (13B)', model: 'meta-llama/Llama-2-13b-chat-hf', tp: 2, mem: 0.9 },
  { name: 'Large Model (70B)', model: 'meta-llama/Llama-2-70b-chat-hf', tp: 4, mem: 0.9 },
]

export default function ConfigForm({ onSubmit, disabled }: ConfigFormProps) {
  const [config, setConfig] = useState({
    model: '',
    tensor_parallel_size: 1,
    port: 8000,
    gpu_memory_utilization: 0.9,
    max_model_len: '',
    quantization: '',
    dtype: '',
    trust_remote_code: false,
    extra_args: '',
  })

  const update = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitConfig: Record<string, any> = {
      ...config,
      max_model_len: config.max_model_len ? parseInt(config.max_model_len) : null,
      quantization: config.quantization || null,
      dtype: config.dtype || null,
    }
    onSubmit(submitConfig)
  }

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setConfig((prev) => ({
      ...prev,
      model: preset.model,
      tensor_parallel_size: preset.tp,
      gpu_memory_utilization: preset.mem,
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <div className="form-section">
        <h3 className="form-section-title">Quick Presets</h3>
        <div className="presets-grid">
          {PRESETS.map((preset) => (
            <motion.button
              key={preset.name}
              type="button"
              className="preset-btn"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => applyPreset(preset)}
            >
              <span className="preset-name">{preset.name}</span>
              <span className="preset-detail">TP={preset.tp}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Model Configuration</h3>

        <div className="form-group">
          <label className="input-label">Model</label>
          <input
            type="text"
            className="input"
            placeholder="e.g., meta-llama/Llama-2-7b-chat-hf"
            value={config.model}
            onChange={(e) => update('model', e.target.value)}
            required
          />
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
                onChange={(e) => update('tensor_parallel_size', parseInt(e.target.value))}
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
                onChange={(e) => update('gpu_memory_utilization', parseFloat(e.target.value))}
              />
              <span className="slider-value">{(config.gpu_memory_utilization * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Port</label>
            <input
              type="number"
              className="input"
              value={config.port}
              onChange={(e) => update('port', parseInt(e.target.value))}
            />
          </div>

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

        <div className="form-group">
          <label className="input-label" style={{ marginBottom: '8px' }}>Trust Remote Code</label>
          <button
            type="button"
            className={`toggle ${config.trust_remote_code ? 'active' : ''}`}
            onClick={() => update('trust_remote_code', !config.trust_remote_code)}
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
      </div>

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
          max-width: 640px;
        }
        .form-section {
          margin-bottom: 32px;
        }
        .form-section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--hairline);
        }
        .presets-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .preset-btn {
          background: var(--canvas-soft);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          padding: 12px 16px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .preset-btn:hover {
          border-color: var(--primary);
          background: var(--primary-glow);
        }
        .preset-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--ink);
        }
        .preset-detail {
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--mute);
        }
        .submit-btn {
          width: 100%;
          justify-content: center;
          padding: 12px;
          font-size: 14px;
        }
      `}</style>
    </form>
  )
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

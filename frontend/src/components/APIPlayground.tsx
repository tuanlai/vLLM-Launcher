import { useState, useRef, useEffect, useCallback } from 'react'
import type { InstanceStatus } from '../api/websocket'

interface APIPlaygroundProps {
  instances: InstanceStatus[]
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatResponse {
  content: string
  latency: number
  promptTokens: number
  completionTokens: number
  model: string
}

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8001`
  : ''

export default function APIPlayground({ instances }: APIPlaygroundProps) {
  const runningInstances = instances.filter((i) => i.state === 'running')

  const [selectedId, setSelectedId] = useState<string>('')
  const [systemMessage, setSystemMessage] = useState('')
  const [userMessage, setUserMessage] = useState('')
  const [maxTokens, setMaxTokens] = useState(512)
  const [temperature, setTemperature] = useState(0.7)
  const [topP, setTopP] = useState(0.9)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-select first running instance if none selected
  useEffect(() => {
    if (!selectedId && runningInstances.length > 0) {
      setSelectedId(runningInstances[0].id)
    }
    // If selected instance is no longer running, clear selection
    if (selectedId && !runningInstances.find((i) => i.id === selectedId)) {
      setSelectedId(runningInstances.length > 0 ? runningInstances[0].id : '')
    }
  }, [runningInstances, selectedId])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, lastResponse])

  const handleSend = useCallback(async () => {
    if (!selectedId || !userMessage.trim() || loading) return

    const currentMessage = userMessage.trim()
    setUserMessage('')
    setError(null)
    setLoading(true)

    // Build messages array
    const messages: { role: string; content: string }[] = []
    if (systemMessage.trim()) {
      messages.push({ role: 'system', content: systemMessage.trim() })
    }
    chatHistory.forEach((m) => {
      if (m.role !== 'system') messages.push({ role: m.role, content: m.content })
    })
    messages.push({ role: 'user', content: currentMessage })

    // Add user message to chat history
    setChatHistory((prev) => [...prev, { role: 'user', content: currentMessage }])

    const startTime = performance.now()

    try {
      const res = await fetch(`${API_BASE}/api/chat/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
        }),
      })

      const latency = Math.round(performance.now() - startTime)

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }

      const data = await res.json()

      const assistantContent =
        data.choices?.[0]?.message?.content ?? data.content ?? JSON.stringify(data)

      const response: ChatResponse = {
        content: assistantContent,
        latency,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        model: data.model ?? 'unknown',
      }

      setLastResponse(response)
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: assistantContent },
      ])
    } catch (err: any) {
      setError(err.message || 'Failed to send message')
      // Remove the optimistic user message on error
      setChatHistory((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }, [selectedId, userMessage, systemMessage, chatHistory, maxTokens, temperature, topP, loading])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setChatHistory([])
    setLastResponse(null)
    setError(null)
  }

  return (
    <div className="playground">
      {/* Controls bar */}
      <div className="playground__controls">
        <div className="playground__control-group">
          <label className="input-label">Instance</label>
          <select
            className="input playground__instance-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {runningInstances.length === 0 && (
              <option value="">No running instances</option>
            )}
            {runningInstances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.model || inst.id}
              </option>
            ))}
          </select>
        </div>

        <div className="playground__control-group">
          <label className="input-label">Max Tokens</label>
          <input
            type="number"
            className="input"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
          />
        </div>

        <div className="playground__control-group">
          <label className="input-label">Temperature</label>
          <div className="slider-container">
            <input
              type="range"
              className="slider"
              min="0"
              max="2"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
            />
            <span className="slider-value">{temperature.toFixed(2)}</span>
          </div>
        </div>

        <div className="playground__control-group">
          <label className="input-label">Top P</label>
          <div className="slider-container">
            <input
              type="range"
              className="slider"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
            />
            <span className="slider-value">{topP.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* System message */}
      <div className="playground__system">
        <label className="input-label">System Message (optional)</label>
        <textarea
          className="input"
          placeholder="You are a helpful assistant..."
          value={systemMessage}
          onChange={(e) => setSystemMessage(e.target.value)}
          rows={2}
        />
      </div>

      {/* Chat area */}
      <div className="playground__chat">
        {chatHistory.length === 0 && !loading && (
          <div className="playground__empty">
            Send a message to start chatting with your model.
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <div key={i} className={`playground__message playground__message--${msg.role}`}>
            <div className="playground__message-role">{msg.role}</div>
            <div className="playground__message-content">{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className="playground__message playground__message--assistant">
            <div className="playground__message-role">assistant</div>
            <div className="playground__message-content playground__loading">
              Thinking...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="playground__error">
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Response stats */}
      {lastResponse && !loading && (
        <div className="playground__stats">
          <span className="playground__stat">
            Latency: <strong>{lastResponse.latency}ms</strong>
          </span>
          <span className="playground__stat">
            Prompt tokens: <strong>{lastResponse.promptTokens}</strong>
          </span>
          <span className="playground__stat">
            Completion tokens: <strong>{lastResponse.completionTokens}</strong>
          </span>
          <span className="playground__stat">
            Model: <strong>{lastResponse.model}</strong>
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="playground__input-area">
        <textarea
          className="input playground__input"
          placeholder="Type a message... (Shift+Enter for new line)"
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={!selectedId}
        />
        <div className="playground__input-actions">
          <button className="btn btn-ghost" onClick={handleClear} disabled={chatHistory.length === 0}>
            Clear
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!selectedId || !userMessage.trim() || loading}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      <style>{`
        .playground {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
          max-width: 900px;
        }
        .playground__controls {
          display: grid;
          grid-template-columns: 1fr 120px 1fr 1fr;
          gap: var(--space-lg);
          align-items: end;
        }
        .playground__control-group {
          display: flex;
          flex-direction: column;
        }
        .playground__instance-select {
          max-width: 100%;
        }
        .playground__system {
          display: flex;
          flex-direction: column;
        }
        .playground__system textarea.input {
          min-height: 56px;
        }
        .playground__chat {
          background: var(--canvas-softer);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          min-height: 200px;
          max-height: 400px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }
        .playground__empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 160px;
          color: var(--mute);
          font-size: 13px;
        }
        .playground__message {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .playground__message-role {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--mute);
        }
        .playground__message--user .playground__message-role {
          color: var(--primary);
        }
        .playground__message--assistant .playground__message-role {
          color: var(--success);
        }
        .playground__message-content {
          font-size: 13px;
          line-height: 1.6;
          color: var(--ink);
          white-space: pre-wrap;
          word-break: break-word;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          padding: var(--space-sm) var(--space-md);
        }
        .playground__loading {
          color: var(--mute);
          font-style: italic;
        }
        .playground__error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--error-soft);
          border: 1px solid var(--error);
          border-radius: var(--radius-md);
          padding: var(--space-sm) var(--space-md);
          color: var(--error);
          font-size: 13px;
        }
        .playground__stats {
          display: flex;
          gap: var(--space-xl);
          flex-wrap: wrap;
          padding: var(--space-sm) 0;
          border-top: 1px solid var(--hairline);
        }
        .playground__stat {
          font-size: 12px;
          color: var(--mute);
        }
        .playground__stat strong {
          font-family: var(--font-mono);
          color: var(--ink);
        }
        .playground__input-area {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }
        .playground__input {
          min-height: 80px;
          resize: vertical;
        }
        .playground__input-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-sm);
        }
      `}</style>
    </div>
  )
}

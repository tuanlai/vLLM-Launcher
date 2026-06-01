import { useState, useRef, useEffect, useCallback } from 'react'
import type { InstanceStatus } from '../api/websocket'
import type { ChatMessage } from '../api/types'
import { API_BASE } from '../api/config'
import { useI18n } from '../i18n'

interface APIPlaygroundProps {
  instances: InstanceStatus[]
}

interface ChatResponse {
  content: string
  latency: number
  promptTokens: number
  completionTokens: number
  model: string
}

const STORAGE_KEY = 'vllm-playground-chat'

function loadChatState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export default function APIPlayground({ instances }: APIPlaygroundProps) {
  const runningInstances = instances.filter((i) => i.state === 'running')
  const saved = useRef(loadChatState())

  const [selectedId, setSelectedId] = useState<string>(saved.current?.selectedId || '')
  const [systemMessage, setSystemMessage] = useState(saved.current?.systemMessage || '')
  const [userMessage, setUserMessage] = useState('')
  const [maxTokens, setMaxTokens] = useState(saved.current?.maxTokens || 512)
  const [temperature, setTemperature] = useState(saved.current?.temperature || 0.7)
  const [topP, setTopP] = useState(saved.current?.topP || 0.9)
  const [enableThinking, setEnableThinking] = useState(saved.current?.enableThinking ?? true)
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(new Set())
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(saved.current?.chatHistory || [])
  const chatHistoryRef = useRef(chatHistory)
  useEffect(() => { chatHistoryRef.current = chatHistory }, [chatHistory])
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(saved.current?.lastResponse || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showParams, setShowParams] = useState(false)

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedId, systemMessage, chatHistory, lastResponse, maxTokens, temperature, topP, enableThinking,
    }))
  }, [selectedId, systemMessage, chatHistory, lastResponse, maxTokens, temperature, topP, enableThinking])

  const { t } = useI18n()
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedId && runningInstances.length > 0) {
      setSelectedId(runningInstances[0].id)
    }
    if (selectedId && !runningInstances.find((i) => i.id === selectedId)) {
      setSelectedId(runningInstances.length > 0 ? runningInstances[0].id : '')
    }
  }, [runningInstances, selectedId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const handleSend = useCallback(async () => {
    if (!selectedId || !userMessage.trim() || loading) return
    const currentMessage = userMessage.trim()
    setUserMessage('')
    setError(null)
    setLoading(true)

    const messages: { role: string; content: string }[] = []
    if (systemMessage.trim()) messages.push({ role: 'system', content: systemMessage.trim() })
    chatHistoryRef.current.forEach((m) => { if (m.role !== 'system') messages.push({ role: m.role, content: m.content }) })
    messages.push({ role: 'user', content: currentMessage })

    setChatHistory((prev) => [...prev, { role: 'user', content: currentMessage }])
    const startTime = performance.now()

    try {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: '', thinking: '' }])
      const res = await fetch(`${API_BASE}/api/chat/${selectedId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, max_tokens: maxTokens, temperature, top_p: topP, chat_template_kwargs: { enable_thinking: enableThinking } }),
      })

      if (!res.ok) {
        setChatHistory((prev) => prev.slice(0, -1))
        const errData = await res.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }

      if (!res.body) throw new Error('Empty response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let fullThinking = ''
      let promptTokens = 0
      let completionTokens = 0
      let modelName = ''
      let buffer = ''
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { streamDone = true; break }
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(typeof parsed.error === 'string' ? parsed.error : parsed.error.message)
            const delta = parsed.choices?.[0]?.delta?.content
            const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content
            if (reasoningDelta) {
              fullThinking += reasoningDelta
              setChatHistory((prev) => { const next = [...prev]; next[next.length - 1] = { role: 'assistant', content: fullContent, thinking: fullThinking }; return next })
            }
            if (delta) {
              fullContent += delta
              setChatHistory((prev) => { const next = [...prev]; next[next.length - 1] = { role: 'assistant', content: fullContent }; return next })
            }
            if (parsed.usage) { promptTokens = parsed.usage.prompt_tokens ?? promptTokens; completionTokens = parsed.usage.completion_tokens ?? completionTokens }
            if (parsed.model) modelName = parsed.model
          } catch (parseErr: any) { if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr }
        }
      }

      const latency = Math.round(performance.now() - startTime)
      setLastResponse({ content: fullContent, latency, promptTokens, completionTokens, model: modelName || 'unknown' })
    } catch (err: any) {
      setError(err.message || t('playground.sendFailed'))
      setChatHistory((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].content === '') return prev.slice(0, -1)
        return prev.slice(0, -1)
      })
    } finally {
      setLoading(false)
    }
  }, [selectedId, userMessage, systemMessage, maxTokens, temperature, topP, enableThinking, loading])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleClear = () => {
    setChatHistory([]); setLastResponse(null); setError(null); sessionStorage.removeItem(STORAGE_KEY)
  }

  const handleCopyMessage = async (content: string) => {
    try { await navigator.clipboard.writeText(content) } catch {}
  }

  return (
    <div className="pg">
      {/* Chat area */}
      <div className="pg__chat-panel">
        <div className="pg__chat-header">
          <select
            className="input pg__instance-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {runningInstances.length === 0 && <option value="">{t('playground.noRunning')}</option>}
            {runningInstances.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.model || inst.id}</option>
            ))}
          </select>
          <div className="pg__header-actions">
            {lastResponse && !loading && (
              <span className="pg__latency">{lastResponse.latency}ms · {lastResponse.completionTokens} tok</span>
            )}
            <button className="btn btn-ghost pg__params-toggle" onClick={() => setShowParams(!showParams)}>
              <ParamsIcon />
            </button>
          </div>
        </div>

        <div className="pg__messages">
          {chatHistory.length === 0 && !loading && (
            <div className="pg__empty">
              <div className="pg__empty-icon">💬</div>
              <div>{t('playground.emptyHint')}</div>
            </div>
          )}

          {chatHistory.map((msg, i) => (
            <div key={i} className={`pg__msg pg__msg--${msg.role}`}>
              <div className="pg__msg-header">
                <span className="pg__msg-role">{msg.role === 'user' ? t('playground.role.user') : msg.role === 'assistant' ? t('playground.role.assistant') : t('playground.role.system')}</span>
                <button className="pg__msg-copy" onClick={() => handleCopyMessage(msg.thinking ? `[Thinking]\n${msg.thinking}\n\n${msg.content}` : msg.content)} title={t('playground.copy')}>
                  <CopyIcon />
                </button>
              </div>
              {msg.thinking && (
                <div className="pg__thinking">
                  <button className="pg__thinking-toggle" onClick={() => {
                    setExpandedThinking(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })
                  }}>
                    <span className="pg__thinking-icon">{expandedThinking.has(i) ? '▼' : '▶'}</span>
                    <span className="pg__thinking-label">{t('playground.thinkingLabel')}</span>
                  </button>
                  {expandedThinking.has(i) && (
                    <div className="pg__thinking-content">{msg.thinking}</div>
                  )}
                </div>
              )}
              <div className="pg__msg-body">{msg.content || (loading && i === chatHistory.length - 1 && !msg.thinking ? t('playground.thinking') : '')}</div>
            </div>
          ))}

          {loading && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].content === '' && (
            <div className="pg__typing">
              <span className="pg__typing-dot" />
              <span className="pg__typing-dot" />
              <span className="pg__typing-dot" />
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {error && (
          <div className="pg__error">
            <span>{error}</span>
            <button className="pg__error-dismiss" onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="pg__input-bar">
          <textarea
            className="pg__input"
            placeholder={t('playground.inputPlaceholder')}
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={!selectedId}
          />
          <div className="pg__input-actions">
            {chatHistory.length > 0 && (
              <button className="btn btn-ghost pg__clear-btn" onClick={handleClear} title={t('playground.clear')}>
                <TrashIcon />
              </button>
            )}
            <button
              className="btn btn-primary pg__send-btn"
              onClick={handleSend}
              disabled={!selectedId || !userMessage.trim() || loading}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>

      {/* Params sidebar */}
      {showParams && (
        <div className="pg__params-panel">
          <div className="pg__params-header">
            <span className="pg__params-title">{t('playground.parameters')}</span>
            <button className="btn btn-ghost" onClick={() => setShowParams(false)}>×</button>
          </div>

          <div className="pg__param">
            <label className="input-label">{t('playground.systemMessage')}</label>
            <textarea
              className="input pg__param-textarea"
              placeholder={t('playground.systemPlaceholder')}
              value={systemMessage}
              onChange={(e) => setSystemMessage(e.target.value)}
              rows={3}
            />
          </div>

          <div className="pg__param">
            <label className="input-label">{t('playground.maxTokens')}</label>
            <input
              type="number"
              className="input"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
            />
          </div>

          <div className="pg__param">
            <label className="input-label">{t('playground.temperature')}: {temperature.toFixed(2)}</label>
            <input type="range" className="slider" min="0" max="2" step="0.05" value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))} />
          </div>

          <div className="pg__param">
            <label className="input-label">{t('playground.topP')}: {topP.toFixed(2)}</label>
            <input type="range" className="slider" min="0" max="1" step="0.05" value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))} />
          </div>

          <div className="pg__param">
            <label className="pg__toggle-label">
              <input
                type="checkbox"
                checked={enableThinking}
                onChange={(e) => setEnableThinking(e.target.checked)}
              />
              <span>{t('playground.enableThinking')}</span>
            </label>
            <span className="pg__toggle-hint">{t('playground.enableThinkingHint')}</span>
          </div>

          {lastResponse && (
            <div className="pg__param-stats">
              <div className="pg__param-stat"><span>{t('playground.latency')}</span><strong>{lastResponse.latency}ms</strong></div>
              <div className="pg__param-stat"><span>{t('playground.promptTokens')}</span><strong>{lastResponse.promptTokens}</strong></div>
              <div className="pg__param-stat"><span>{t('playground.completionTokens')}</span><strong>{lastResponse.completionTokens}</strong></div>
              <div className="pg__param-stat"><span>{t('playground.model')}</span><strong>{lastResponse.model}</strong></div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .pg {
          display: flex;
          gap: var(--space-lg);
          height: calc(100vh - 140px);
          max-height: 800px;
        }
        .pg__chat-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          overflow: hidden;
          min-width: 0;
        }
        .pg__chat-header {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md) var(--space-lg);
          border-bottom: 1px solid var(--hairline);
          flex-shrink: 0;
        }
        .pg__instance-select {
          flex: 1;
          max-width: 320px;
          font-size: 13px;
        }
        .pg__header-actions {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-left: auto;
        }
        .pg__latency {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--mute);
        }
        .pg__params-toggle svg { width: 16px; height: 16px; }
        .pg__messages {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-2xl) var(--space-3xl);
          display: flex;
          flex-direction: column;
          gap: var(--space-2xl);
        }
        .pg__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: var(--space-md);
          color: var(--mute);
          font-size: 14px;
        }
        .pg__empty-icon { font-size: 36px; opacity: 0.4; }
        .pg__msg {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 80%;
        }
        .pg__msg--user { align-self: flex-end; }
        .pg__msg--assistant { align-self: flex-start; }
        .pg__msg--system { align-self: center; max-width: 60%; }
        .pg__msg-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 4px;
        }
        .pg__msg--user .pg__msg-header { justify-content: flex-end; }
        .pg__msg-role {
          font-size: 11px;
          font-weight: 500;
          color: var(--mute);
          letter-spacing: 0.2px;
        }
        .pg__msg--user .pg__msg-role { color: var(--body); }
        .pg__msg--assistant .pg__msg-role { color: var(--body); }
        .pg__msg-copy {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          color: var(--mute);
          opacity: 0;
          transition: opacity 0.15s;
          display: flex;
        }
        .pg__msg:hover .pg__msg-copy { opacity: 0.7; }
        .pg__msg-copy:hover { color: var(--ink); opacity: 1; }
        .pg__msg-copy svg { width: 12px; height: 12px; }
        .pg__msg-body {
          font-size: 14px;
          line-height: 1.65;
          color: var(--ink);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .pg__msg--user .pg__msg-body {
          background: var(--canvas-softer);
          border: 1px solid var(--hairline);
          padding: 10px 16px;
          border-radius: 16px 16px 4px 16px;
        }
        .pg__msg--assistant .pg__msg-body {
          background: transparent;
          padding: 4px 4px;
          line-height: 1.7;
        }
        .pg__msg--system .pg__msg-body {
          background: var(--canvas-softer);
          color: var(--mute);
          font-size: 12px;
          text-align: center;
          padding: 8px 16px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
        }
        .pg__typing {
          display: flex;
          gap: 4px;
          padding: var(--space-md) var(--space-lg);
          align-self: flex-start;
        }
        .pg__typing-dot {
          width: 6px;
          height: 6px;
          background: var(--mute);
          border-radius: 50%;
          animation: pg-bounce 1.2s ease-in-out infinite;
        }
        .pg__typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .pg__typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pg-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .pg__thinking {
          margin-top: var(--space-xs);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .pg__thinking-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          background: none;
          border: none;
          cursor: pointer;
          padding: var(--space-xs) var(--space-sm);
          font-size: 11px;
          color: var(--mute);
          font-family: var(--font-sans);
          transition: color 0.15s;
        }
        .pg__thinking-toggle:hover { color: var(--ink); }
        .pg__thinking-icon { font-size: 9px; }
        .pg__thinking-content {
          padding: var(--space-sm) var(--space-md);
          font-size: 12px;
          line-height: 1.6;
          color: var(--mute);
          white-space: pre-wrap;
          word-break: break-word;
          border-left: 2px solid var(--hairline);
          margin: 0 var(--space-sm) var(--space-sm);
          max-height: 300px;
          overflow-y: auto;
        }
        .pg__toggle-label {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          font-size: 13px;
          color: var(--ink);
          cursor: pointer;
        }
        .pg__toggle-label input { cursor: pointer; }
        .pg__toggle-hint {
          font-size: 11px;
          color: var(--mute);
          margin-top: 2px;
        }
        .pg__error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-sm) var(--space-lg);
          background: var(--error-soft);
          color: var(--error);
          font-size: 12px;
          flex-shrink: 0;
        }
        .pg__error-dismiss {
          background: none;
          border: none;
          color: var(--error);
          cursor: pointer;
          font-size: 16px;
          padding: 0 4px;
        }
        .pg__input-bar {
          display: flex;
          align-items: flex-end;
          gap: var(--space-sm);
          padding: var(--space-md) var(--space-lg);
          border-top: 1px solid var(--hairline);
          flex-shrink: 0;
        }
        .pg__input {
          flex: 1;
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          padding: var(--space-md) var(--space-lg);
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--ink);
          background: var(--canvas);
          outline: none;
          resize: none;
          min-height: 40px;
          max-height: 120px;
          line-height: 1.5;
          transition: border-color 0.15s;
        }
        .pg__input:focus { border-color: var(--primary); }
        .pg__input::placeholder { color: var(--mute); }
        .pg__input-actions {
          display: flex;
          gap: var(--space-xs);
          flex-shrink: 0;
        }
        .pg__send-btn, .pg__clear-btn {
          width: 36px;
          height: 36px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
        .pg__send-btn svg, .pg__clear-btn svg { width: 16px; height: 16px; }
        .pg__clear-btn { color: var(--mute); }
        .pg__clear-btn:hover { color: var(--error); background: var(--error-soft); }

        /* Params sidebar */
        .pg__params-panel {
          width: 280px;
          flex-shrink: 0;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .pg__params-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md) var(--space-lg);
          border-bottom: 1px solid var(--hairline);
          flex-shrink: 0;
        }
        .pg__params-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
        }
        .pg__param {
          padding: var(--space-md) var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        .pg__param-textarea {
          min-height: 60px;
          resize: vertical;
          font-size: 12px;
        }
        .pg__param-stats {
          padding: var(--space-md) var(--space-lg);
          border-top: 1px solid var(--hairline);
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }
        .pg__param-stat {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }
        .pg__param-stat span { color: var(--mute); }
        .pg__param-stat strong { font-family: var(--font-mono); color: var(--ink); font-size: 12px; }
      `}</style>
    </div>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ParamsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

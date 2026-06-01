import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { API_BASE } from '../api/config'
import { useI18n, type Language } from '../i18n'
import FileBrowser from '../components/FileBrowser'
import { BrowseIcon } from '../components/icons'

export default function Settings() {
  const { lang, setLang, t } = useI18n()
  const [pythonPath, setPythonPath] = useState('')
  const [pythonPathDraft, setPythonPathDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [vllmVersion, setVllmVersion] = useState<string | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then((res) => res.json())
      .then((data) => {
        setPythonPath(data.python_path || '')
        setPythonPathDraft(data.python_path || '')
      })
      .catch(() => {})
    fetch(`${API_BASE}/api/version`)
      .then((res) => res.json())
      .then((data) => {
        setVllmVersion(data.vllm_version)
      })
      .catch(() => {})
  }, [])

  const handleLangChange = (newLang: Language) => {
    setLang(newLang)
  }

  const handleApplyPath = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ python_path: pythonPathDraft }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || t('settings.saveFailed'))
      }
      setPythonPath(pythonPathDraft)
      setFeedback({ type: 'success', message: t('settings.saved') })
      setTimeout(() => setFeedback(null), 3000)
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || t('settings.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const pageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25 }}
    >
      <div className="settings-header">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* Language */}
      <div className="card settings-section">
        <div className="card-header">
          <div>
            <span className="card-title">{t('settings.language')}</span>
            <span className="card-subtitle">{t('settings.languageDesc')}</span>
          </div>
        </div>
        <div className="settings-lang-options">
          {(['en', 'zh'] as Language[]).map((l) => (
            <button
              key={l}
              className={`settings-lang-btn ${lang === l ? 'settings-lang-btn--active' : ''}`}
              onClick={() => handleLangChange(l)}
            >
              <span className="settings-lang-check">{lang === l ? '✓' : ''}</span>
              <span>{l === 'en' ? 'English' : '简体中文'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* vLLM Version Info */}
      <div className="card settings-section">
        <div className="card-header">
          <div>
            <span className="card-title">{t('settings.vllmVersion')}</span>
            <span className="card-subtitle">{t('settings.versionDesc')}</span>
          </div>
        </div>
        <div className="settings-version">
          {vllmVersion ? (
            <span className="settings-version-tag">v{vllmVersion}</span>
          ) : (
            <span className="settings-version-unknown">{t('settings.notDetected')}</span>
          )}
        </div>
      </div>

      {/* vLLM Python Path */}
      <div className="card settings-section">
        <div className="card-header">
          <div>
            <span className="card-title">{t('settings.pythonPath')}</span>
            <span className="card-subtitle">{t('settings.pythonPathDesc')}</span>
          </div>
        </div>
        <div className="settings-path-row">
          <input
            type="text"
            className="input settings-path-input"
            value={pythonPathDraft}
            onChange={(e) => setPythonPathDraft(e.target.value)}
            placeholder="/path/to/venv/bin/python"
          />
          <button
            className="btn btn-ghost"
            onClick={() => setShowBrowser(true)}
            title={t('fileBrowser.browse')}
          >
            <BrowseIcon />
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApplyPath}
            disabled={saving || pythonPathDraft === pythonPath || !pythonPathDraft}
          >
            {saving ? t('settings.saving') : t('settings.apply')}
          </button>
        </div>
        {pythonPath && pythonPath !== pythonPathDraft && (
          <p className="settings-path-current">
            {t('settings.currentPath')}: <code>{pythonPath}</code>
          </p>
        )}
      </div>

      {showBrowser && (
        <FileBrowser
          mode="file"
          initialPath={pythonPathDraft ? pythonPathDraft.substring(0, pythonPathDraft.lastIndexOf('/')) : '/home'}
          filter={(entry) => entry.is_dir || entry.name.startsWith('python')}
          onSelect={(path) => {
            setPythonPathDraft(path)
            setShowBrowser(false)
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}

      {/* Feedback Toast */}
      {feedback && (
        <motion.div
          className={`settings-toast settings-toast--${feedback.type}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
        >
          {feedback.message}
        </motion.div>
      )}

      <style>{`
        .settings-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
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
        .settings-section {
          margin-bottom: 20px;
          padding: 24px;
        }
        .settings-lang-options {
          display: flex;
          gap: 12px;
        }
        .settings-lang-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 500;
          color: var(--body);
          transition: all 0.15s ease;
          min-width: 160px;
        }
        .settings-lang-btn:hover {
          border-color: var(--hairline-soft);
          background: var(--canvas-soft);
        }
        .settings-lang-btn--active {
          border-color: var(--primary);
          background: var(--primary-glow);
          color: var(--ink);
        }
        .settings-lang-check {
          width: 18px;
          font-size: 14px;
          color: var(--primary);
        }
        .settings-path-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .settings-path-input {
          flex: 1;
          font-family: var(--font-mono);
          font-size: 13px;
        }
        .settings-path-current {
          margin-top: 10px;
          font-size: 12px;
          color: var(--mute);
        }
        .settings-path-current code {
          font-family: var(--font-mono);
          background: var(--canvas-softer);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
        }
        .settings-version {
          display: flex;
          align-items: center;
        }
        .settings-version-tag {
          font-family: var(--font-mono);
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          background: var(--canvas-softer);
          padding: 6px 14px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--hairline);
        }
        .settings-version-unknown {
          font-size: 13px;
          color: var(--mute);
          font-style: italic;
        }
        .settings-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          padding: 12px 20px;
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 500;
          z-index: 1000;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .settings-toast--success {
          background: var(--success-soft, #ecfdf5);
          color: var(--success, #10b981);
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .settings-toast--error {
          background: var(--error-soft, #fef2f2);
          color: var(--error, #ef4444);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
      `}</style>
    </motion.div>
  )
}

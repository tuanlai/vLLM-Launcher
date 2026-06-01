import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../i18n'
import type { FileEntry } from '../api/types'

interface BrowseResponse {
  path: string
  parent: string | null
  entries: FileEntry[]
}

interface FileBrowserProps {
  mode: 'file' | 'dir'
  onSelect: (path: string) => void
  onClose: () => void
  initialPath?: string
  filter?: (entry: FileEntry) => boolean
}

export default function FileBrowser({ mode, onSelect, onClose, initialPath, filter }: FileBrowserProps) {
  const { t } = useI18n()
  const [currentPath, setCurrentPath] = useState(initialPath || '/home')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [parent, setParent] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDir = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const url = `/api/files/browse?path=${encodeURIComponent(path)}`
      const res = await fetch(url)
      if (!res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          throw new Error(data.detail || `Failed to browse: ${path}`)
        } catch (e: any) {
          if (e.message && !e.message.includes('Failed to browse')) throw e
          throw new Error(`Server error (status ${res.status})`)
        }
      }
      const text = await res.text()
      let data: BrowseResponse
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Invalid response from server (got ${text.substring(0, 80)})`)
      }
      setCurrentPath(data.path)
      setParent(data.parent)
      let filtered = data.entries
      if (filter) {
        filtered = filtered.filter(filter)
      } else if (mode === 'file') {
        filtered = data.entries
      }
      setEntries(filtered)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [mode, filter])

  useEffect(() => {
    fetchDir(currentPath)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      fetchDir(entry.path)
    } else if (mode === 'file') {
      setSelected(entry.path)
    }
  }

  const handleUp = () => {
    if (parent) {
      fetchDir(parent)
    }
  }

  const handleSelect = () => {
    if (mode === 'dir') {
      onSelect(currentPath)
    } else if (selected) {
      onSelect(selected)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const pathParts = currentPath.split('/').filter(Boolean)

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div className="fb-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fb-header">
          <span className="fb-title">{t('fileBrowser.title')}</span>
          <button className="btn btn-ghost fb-close" onClick={onClose}>&times;</button>
        </div>

        {/* Path bar */}
        <div className="fb-pathbar">
          <button
            className="btn btn-ghost fb-up-btn"
            onClick={handleUp}
            disabled={!parent}
            title={t('fileBrowser.up')}
          >
            <UpIcon />
          </button>
          <div className="fb-breadcrumbs">
            <span className="fb-bc-root" onClick={() => fetchDir('/')}>/</span>
            {pathParts.map((part, i) => {
              const partPath = '/' + pathParts.slice(0, i + 1).join('/')
              return (
                <span key={partPath}>
                  <span className="fb-bc-sep">/</span>
                  <span className="fb-bc-part" onClick={() => fetchDir(partPath)}>{part}</span>
                </span>
              )
            })}
          </div>
        </div>

        {/* File list */}
        <div className="fb-list">
          {loading ? (
            <div className="fb-empty">{t('fileBrowser.loading')}</div>
          ) : error ? (
            <div className="fb-error">{error}</div>
          ) : entries.length === 0 ? (
            <div className="fb-empty">{t('fileBrowser.empty')}</div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.path}
                className={`fb-entry ${selected === entry.path ? 'fb-entry--selected' : ''}`}
                onClick={() => handleClick(entry)}
                onDoubleClick={() => {
                  if (entry.is_dir) fetchDir(entry.path)
                  else if (mode === 'file') onSelect(entry.path)
                }}
              >
                <span className="fb-entry-icon">
                  {entry.is_dir ? <FolderIcon /> : <FileIcon />}
                </span>
                <span className="fb-entry-name">{entry.name}</span>
                {!entry.is_dir && entry.size > 0 && (
                  <span className="fb-entry-size">{formatSize(entry.size)}</span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="fb-footer">
          <div className="fb-selected-path">
            {mode === 'dir'
              ? `${t('fileBrowser.currentPath')}: ${currentPath}`
              : selected || currentPath
            }
          </div>
          <div className="fb-footer-actions">
            <button className="btn btn-ghost" onClick={onClose}>{t('fileBrowser.cancel')}</button>
            <button
              className="btn btn-primary"
              onClick={handleSelect}
              disabled={mode === 'file' && !selected}
            >
              {t('fileBrowser.select')}
            </button>
          </div>
        </div>

        <style>{`
          .fb-overlay {
            position: fixed;
            inset: 0;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-xl);
          }
          .fb-card {
            background: var(--canvas);
            border: 1px solid var(--hairline);
            border-radius: var(--radius-lg);
            width: 100%;
            max-width: 640px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
          }
          .fb-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-lg) var(--space-xl);
            border-bottom: 1px solid var(--hairline);
          }
          .fb-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--ink);
          }
          .fb-close {
            font-size: 18px;
            line-height: 1;
            padding: var(--space-xs) var(--space-sm);
          }
          .fb-pathbar {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-sm) var(--space-xl);
            border-bottom: 1px solid var(--hairline);
            background: var(--canvas-soft);
            min-height: 36px;
          }
          .fb-up-btn {
            padding: 4px 6px;
            flex-shrink: 0;
          }
          .fb-up-btn svg {
            width: 14px;
            height: 14px;
          }
          .fb-breadcrumbs {
            font-family: var(--font-mono);
            font-size: 12px;
            color: var(--body);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
          }
          .fb-bc-root {
            cursor: pointer;
            color: var(--primary);
          }
          .fb-bc-root:hover {
            text-decoration: underline;
          }
          .fb-bc-sep {
            color: var(--mute);
            margin: 0 1px;
          }
          .fb-bc-part {
            cursor: pointer;
            color: var(--primary);
          }
          .fb-bc-part:hover {
            text-decoration: underline;
          }
          .fb-list {
            flex: 1;
            overflow-y: auto;
            min-height: 200px;
            max-height: 400px;
          }
          .fb-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            min-height: 120px;
            color: var(--mute);
            font-size: 13px;
          }
          .fb-error {
            padding: var(--space-xl);
            color: var(--error);
            font-size: 13px;
          }
          .fb-entry {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-sm) var(--space-xl);
            cursor: pointer;
            transition: background 0.1s;
            user-select: none;
          }
          .fb-entry:hover {
            background: var(--surface-hover);
          }
          .fb-entry--selected {
            background: var(--primary-glow);
            border-left: 2px solid var(--primary);
          }
          .fb-entry-icon {
            flex-shrink: 0;
            display: flex;
            align-items: center;
          }
          .fb-entry-icon svg {
            width: 16px;
            height: 16px;
          }
          .fb-entry-name {
            font-size: 13px;
            color: var(--ink);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .fb-entry--selected .fb-entry-name {
            font-weight: 500;
          }
          .fb-entry-size {
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--mute);
            flex-shrink: 0;
          }
          .fb-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-md);
            padding: var(--space-md) var(--space-xl);
            border-top: 1px solid var(--hairline);
          }
          .fb-selected-path {
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--mute);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
            min-width: 0;
          }
          .fb-footer-actions {
            display: flex;
            gap: var(--space-sm);
            flex-shrink: 0;
          }
        `}</style>
      </div>
    </div>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  )
}

function UpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

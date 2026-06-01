import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../i18n'

const navItems = [
  { path: '/', labelKey: 'nav.dashboard' as const, icon: DashboardIcon },
  { path: '/instances', labelKey: 'nav.instances' as const, icon: InstancesIcon },
  { path: '/logs', labelKey: 'nav.logs' as const, icon: LogsIcon },
  { path: '/playground', labelKey: 'nav.playground' as const, icon: PlaygroundIcon },
  { path: '/settings', labelKey: 'nav.settings' as const, icon: SettingsIcon },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { t } = useI18n()

  return (
    <motion.nav
      className="sidebar"
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
    >
      <div className="sidebar-header">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              className="sidebar-logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span className="logo-icon">⚡</span>
              <span className="logo-text">vLLM Launcher</span>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && <span className="logo-icon-mini">⚡</span>}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>

      <div className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <item.icon />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  className="sidebar-link-label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {t(item.labelKey)}
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              className="sidebar-version"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              v1.0.0
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .sidebar {
          height: 100vh;
          background: var(--canvas);
          border-right: 1px solid var(--hairline);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-shrink: 0;
        }
        .sidebar-header {
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--hairline);
          min-height: 56px;
        }
        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
          white-space: nowrap;
        }
        .logo-icon, .logo-icon-mini {
          font-size: 20px;
          line-height: 1;
          flex-shrink: 0;
        }
        .logo-icon-mini {
          margin: 0 auto;
        }
        .logo-text {
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          letter-spacing: -0.3px;
        }
        .sidebar-toggle {
          background: none;
          border: none;
          color: var(--mute);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: color 0.15s, background 0.15s;
        }
        .sidebar-toggle:hover {
          color: var(--ink);
          background: var(--surface-hover);
        }
        .sidebar-nav {
          flex: 1;
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 6px;
          color: var(--body);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.15s ease;
          position: relative;
          overflow: hidden;
          white-space: nowrap;
        }
        .sidebar-link:hover {
          background: var(--surface-hover);
          color: var(--ink);
        }
        .sidebar-link.active {
          background: var(--primary-glow);
          color: var(--primary);
        }
        .sidebar-link.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 6px;
          bottom: 6px;
          width: 3px;
          background: var(--primary);
          border-radius: 0 2px 2px 0;
        }
        .sidebar-link svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }
        .sidebar-link-label {
          overflow: hidden;
          white-space: nowrap;
        }
        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid var(--hairline);
          text-align: center;
        }
        .sidebar-version {
          font-size: 11px;
          color: var(--mute);
          font-family: var(--font-mono);
        }
      `}</style>
    </motion.nav>
  )
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function LogsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function InstancesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="6" rx="1" />
      <rect x="2" y="15" width="20" height="6" rx="1" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}

function PlaygroundIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'left' ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  )
}

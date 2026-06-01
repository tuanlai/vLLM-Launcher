import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}

      <style>{`
        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
          gap: 16px;
        }
        .page-header-text {
          flex: 1;
          min-width: 0;
        }
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: var(--ink);
          margin: 0;
          line-height: 1.3;
        }
        .page-subtitle {
          font-size: 14px;
          color: var(--mute);
          margin: 4px 0 0;
        }
        .page-header-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          align-items: center;
        }
      `}</style>
    </div>
  )
}

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n'

interface ClassProps {
  children: ReactNode
  fallback?: ReactNode
  t: (key: string) => string
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryClass extends Component<ClassProps, State> {
  constructor(props: ClassProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const { t } = this.props

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2 className="error-boundary-title">{t('error.title')}</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || t('error.default')}
            </p>
            <button className="btn btn-primary" onClick={this.handleReset}>
              {t('error.tryAgain')}
            </button>
          </div>
          <style>{`
            .error-boundary {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 300px;
              padding: var(--space-3xl);
            }
            .error-boundary-content {
              text-align: center;
              max-width: 400px;
            }
            .error-boundary-title {
              font-size: 18px;
              font-weight: 600;
              color: var(--ink);
              margin-bottom: var(--space-sm);
            }
            .error-boundary-message {
              font-size: 13px;
              color: var(--body);
              margin-bottom: var(--space-xl);
              line-height: 1.5;
            }
          `}</style>
        </div>
      )
    }

    return this.props.children
  }
}

export default function ErrorBoundary({ children, fallback }: { children: ReactNode, fallback?: ReactNode }) {
  const { t } = useI18n()
  return <ErrorBoundaryClass children={children} fallback={fallback} t={t as (key: string) => string} />
}

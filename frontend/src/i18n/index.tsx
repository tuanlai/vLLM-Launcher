import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import en, { type TranslationKey } from './en'
import zh from './zh'

export type Language = 'en' | 'zh'

const STORAGE_KEY = 'vllm-launcher-lang'

const translations: Record<Language, Record<TranslationKey, string>> = { en, zh }

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, string>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getInitialLang(): Language {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'zh') return stored
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLang)

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem(STORAGE_KEY, newLang)
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>): string => {
      let text = translations[lang][key] || translations.en[key] || key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, v)
        }
      }
      return text
    },
    [lang],
  )

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

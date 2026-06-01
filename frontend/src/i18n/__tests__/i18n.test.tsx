import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useI18n, I18nProvider } from '../index'
import { createElement, type ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nProvider, null, children)

describe('useI18n', () => {
  it('returns t function that translates keys', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    const { t } = result.current
    const translated = t('nav.dashboard')
    expect(typeof translated).toBe('string')
    expect(translated.length).toBeGreaterThan(0)
  })

  it('falls back to key for unknown translations', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    const { t } = result.current
    // @ts-expect-error testing unknown key
    const translated = t('nonexistent.key.that.does.not.exist')
    expect(translated).toBe('nonexistent.key.that.does.not.exist')
  })

  it('defaults to English language', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe('en')
  })
})

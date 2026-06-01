import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch, apiGet, apiPost, ApiError } from '../client'

vi.mock('../config', () => ({
  API_BASE: 'http://localhost:8001',
}))

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('apiGet', () => {
    it('returns parsed JSON on success', async () => {
      const mockData = { status: 'ok' }
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      )
      const result = await apiGet('/api/health')
      expect(result).toEqual(mockData)
    })

    it('throws ApiError on non-ok response', async () => {
      const mockRes = {
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: 'Not found' }),
      } as unknown as Response
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes)
      await expect(apiGet('/api/missing')).rejects.toThrow(ApiError)
      await expect(apiGet('/api/missing')).rejects.toMatchObject({
        status: 404,
        message: 'Not found',
      })
    })
  })

  describe('apiPost', () => {
    it('sends JSON body and returns parsed response', async () => {
      const mockData = { success: true }
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 })
      )
      const result = await apiPost('/api/presets', { name: 'test', config: {} })
      expect(result).toEqual(mockData)
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8001/api/presets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test', config: {} }),
        })
      )
    })
  })

  describe('apiFetch', () => {
    it('sets Content-Type header by default', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{}', { status: 200 })
      )
      await apiFetch('/api/test')
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8001/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      )
    })

    it('prepends API_BASE to path', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{}', { status: 200 })
      )
      await apiFetch('/api/test')
      expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:8001/api/test')
    })
  })
})

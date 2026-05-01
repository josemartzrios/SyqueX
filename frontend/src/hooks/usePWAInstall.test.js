import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import usePWAInstall from './usePWAInstall'

describe('usePWAInstall', () => {
  const setUA = (ua) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })

  afterEach(() => {
    setUA('')
    vi.restoreAllMocks()
  })

  describe('browser detection', () => {
    it('detects Safari on iOS', () => {
      setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('safari')
      expect(result.current.isMobile).toBe(true)
    })

    it('detects Chrome on Android', () => {
      setUA('Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('chrome')
      expect(result.current.isMobile).toBe(true)
    })

    it('detects Chrome on desktop and isMobile=false', () => {
      setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('chrome')
      expect(result.current.isMobile).toBe(false)
    })

    it('returns "other" for Firefox', () => {
      setUA('Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0')
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.browser).toBe('other')
    })
  })

  describe('beforeinstallprompt', () => {
    it('isInstallable is false initially', () => {
      const { result } = renderHook(() => usePWAInstall())
      expect(result.current.isInstallable).toBe(false)
    })

    it('isInstallable becomes true when beforeinstallprompt fires', () => {
      const { result } = renderHook(() => usePWAInstall())
      const fakePrompt = { preventDefault: vi.fn(), prompt: vi.fn().mockResolvedValue({ outcome: 'accepted' }) }
      act(() => {
        window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakePrompt))
      })
      expect(result.current.isInstallable).toBe(true)
    })

    it('triggerInstall calls prompt() on deferred event', async () => {
      const { result } = renderHook(() => usePWAInstall())
      const fakePrompt = { preventDefault: vi.fn(), prompt: vi.fn().mockResolvedValue({ outcome: 'accepted' }) }
      act(() => {
        window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakePrompt))
      })
      await act(async () => { await result.current.triggerInstall() })
      expect(fakePrompt.prompt).toHaveBeenCalledTimes(1)
    })

    it('triggerInstall is no-op when no deferred prompt', async () => {
      const { result } = renderHook(() => usePWAInstall())
      await expect(result.current.triggerInstall()).resolves.toBeUndefined()
    })
  })
})

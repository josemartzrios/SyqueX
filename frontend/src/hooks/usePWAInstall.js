import { useState, useEffect } from 'react'

function detectBrowser() {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isChromeiOS = /CriOS/.test(ua)           // Chrome on iOS
  const isChrome = /Chrome/.test(ua) || isChromeiOS
  const isSafari = isIOS && /Safari/.test(ua) && !isChromeiOS

  if (isSafari) return 'safari'
  if (isChrome) return 'chrome'
  return 'other'
}

function detectMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const browser = detectBrowser()
  const isMobile = detectMobile()

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const triggerInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setDeferredPrompt(null)
  }

  return {
    deferredPrompt,
    isInstallable: deferredPrompt !== null,
    triggerInstall,
    browser,
    isMobile,
  }
}

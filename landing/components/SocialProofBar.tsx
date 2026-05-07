'use client'
import { useEffect, useRef, useState } from 'react'

function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const spanRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let start = 0
    const step = Math.ceil(target / 30)
    const timer = setInterval(() => {
      start += step
      if (start >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(start)
      }
    }, 40)
    return () => clearInterval(timer)
  }, [visible, target])

  return (
    <span ref={spanRef}>
      {count}
      {suffix}
    </span>
  )
}

export default function SocialProofBar() {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 flex justify-center gap-10 sm:gap-16 flex-wrap">
      {[
        { n: 45, s: 's', label: 'nota clínica generada' },
        { n: 20, s: 'min', label: 'ahorrados por sesión' },
        { n: 100, s: '%', label: 'privado y cifrado' },
      ].map(({ n, s, label }) => (
        <div key={label} className="text-center">
          <div className="text-4xl font-bold text-sage">
            <CountUp target={n} suffix={s} />
          </div>
          <div className="text-sm text-ink-tertiary mt-1">{label}</div>
        </div>
      ))}
    </section>
  )
}

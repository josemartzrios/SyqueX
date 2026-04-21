import { useState, useEffect } from 'react'
import { confirmNote } from '../api'

// Color constants
const SAGE = '#5a9e8a'
const MUTED = '#9ca3af'
const INK = '#18181b'

// Local copy of parseSoapText (from NoteReview) — do not import from NoteReview
function parseSoapText(text) {
  if (!text) return null
  const labels = { subjective: 'Subjetivo', objective: 'Objetivo', assessment: 'Análisis', plan: 'Plan' }
  const keys = Object.keys(labels)
  const result = {}
  keys.forEach((key, i) => {
    const label = labels[key]
    const nextLabel = i < keys.length - 1 ? labels[keys[i + 1]] : null
    const pattern = nextLabel
      ? new RegExp(`${label}:\\s*([\\s\\S]*?)(?=${nextLabel}:)`, 'i')
      : new RegExp(`${label}:\\s*([\\s\\S]*)`, 'i')
    const match = text.match(pattern)
    if (match) {
      const value = match[1].trim()
      if (value && value.toLowerCase() !== 'no mencionado') result[key] = value
    }
  })
  return Object.keys(result).length > 0 ? { structured_note: result } : null
}

const SECTIONS = [
  { key: 'subjective', letter: 'S', label: 'Subjetivo'  },
  { key: 'objective',  letter: 'O', label: 'Objetivo'   },
  { key: 'assessment', letter: 'A', label: 'Análisis'   },
  { key: 'plan',       letter: 'P', label: 'Plan'       },
]

export default function SoapNoteDocument({ noteData, onConfirm, readOnly = false, compact = false }) {
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Parse note data
  const parsedNote = !noteData.clinical_note && noteData.text_fallback
    ? parseSoapText(noteData.text_fallback)
    : null
  const clinicalNote = noteData.clinical_note || parsedNote
  const noteContent = clinicalNote?.structured_note || {}
  const alerts = noteData.clinical_note?.alerts || []
  const patterns = noteData.clinical_note?.detected_patterns || []

  const hasStructuredNote = !!(clinicalNote && Object.keys(noteContent).length > 0)

  const handleConfirm = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const sid = noteData.clinical_note?.session_id || noteData.session_id
      await confirmNote(sid, {
        format: 'SOAP',
        structured_note: noteContent,
        detected_patterns: patterns,
        alerts: alerts,
      })
      setConfirmed(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Handle confirm timeout cleanup
  useEffect(() => {
    if (!confirmed) return
    const timer = setTimeout(() => { onConfirm?.() }, 2000)
    return () => clearTimeout(timer)
  }, [confirmed, onConfirm])

  return (
    <div className={`font-serif max-w-prose ${compact ? 'px-5 py-4' : 'px-6 py-6'}`}>

      {/* Document header label */}
      {hasStructuredNote && !compact && (
        <p className="font-sans text-[10px] font-bold tracking-[0.14em] uppercase mb-6" style={{ color: SAGE }}>
          Nota Clínica · SOAP
        </p>
      )}

      {/* Fallback: plain text only (no structured sections) */}
      {!hasStructuredNote && noteData.text_fallback && (
        <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: INK }}>
          {noteData.text_fallback}
        </p>
      )}

      {/* SOAP sections */}
      {hasStructuredNote && SECTIONS.map(({ key, label }, sectionIndex) => {
        const content = noteContent[key]
        const hasContent = !!content
        return (
          <div key={key} className={sectionIndex > 0 ? (compact ? 'mt-6' : 'mt-8') : ''}>
            {/* Section label */}
            <p
              className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase"
              style={{ fontVariant: 'small-caps', color: hasContent ? SAGE : MUTED }}
            >
              {label}
            </p>
            {/* Thin rule */}
            <hr className="border-0 border-t border-current mt-1 mb-3" style={{ color: hasContent ? `${SAGE}33` : `${MUTED}33` }} />
            {/* Content */}
            <p className="font-serif text-[15px] leading-relaxed" style={{ color: INK }}>
              {content || <span style={{ color: MUTED }}>—</span>}
            </p>
          </div>
        )
      })}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mt-8">
          <p className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase text-red-600 mb-2">
            Alertas detectadas
          </p>
          <ul className="font-sans text-[14px] text-red-700 space-y-1 list-disc pl-4">
            {alerts.map((a, i) => <li key={i}>{a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</li>)}
          </ul>
        </div>
      )}

      {/* Patterns */}
      {patterns.length > 0 && (
        <div className="mt-6">
          <p className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase text-[#c4935a] mb-2">
            Patrones evolutivos
          </p>
          <ul className="font-sans text-[14px] text-[#92681e] space-y-1 list-disc pl-4">
            {patterns.map((p, i) => <li key={i}>{p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</li>)}
          </ul>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <p className="font-sans mt-4 text-[13px] text-red-600">{saveError}</p>
      )}

      {/* Confirm button — only when not readOnly and there is a structured note */}
      {!readOnly && hasStructuredNote && (
        <div className="mt-8">
          {!confirmed ? (
            <button
              onClick={handleConfirm}
              disabled={saving}
              className={`text-white rounded-xl px-5 py-2.5 text-[14px] font-medium transition-opacity font-sans ${
                saving ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
              }`}
              style={{ backgroundColor: SAGE }}
            >
              {saving ? 'Guardando…' : 'Confirmar'}
            </button>
          ) : (
            <span className="font-sans text-[14px] font-medium" style={{ color: SAGE }}>
              Guardada ✓
            </span>
          )}
        </div>
      )}

    </div>
  )
}

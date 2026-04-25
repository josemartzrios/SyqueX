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

export default function SoapNoteDocument({ noteData, onConfirm, onDelete, readOnly = false, compact = false }) {
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Parse note data
  const parsedNote = !noteData.clinical_note && noteData.text_fallback
    ? parseSoapText(noteData.text_fallback)
    : null
  const clinicalNote = noteData.clinical_note || parsedNote
  const noteContent = clinicalNote?.structured_note || {}
  const alerts = noteData.clinical_note?.alerts || []
  const patterns = noteData.clinical_note?.detected_patterns || []

  const hasStructuredNote = !!(clinicalNote && Object.keys(noteContent).length > 0)

  const [editedFields, setEditedFields] = useState({
    subjective: noteContent.subjective ?? '',
    objective: noteContent.objective ?? '',
    assessment: noteContent.assessment ?? '',
    plan: noteContent.plan ?? '',
    alerts: noteData.clinical_note?.alerts ?? [],
    detected_patterns: noteData.clinical_note?.detected_patterns ?? [],
  })
  const [activeField, setActiveField] = useState(null)
  const [newAlertInput, setNewAlertInput] = useState(false)
  const [newPatternInput, setNewPatternInput] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const sid = noteData.clinical_note?.session_id || noteData.session_id
      await confirmNote(sid, {
        format: 'SOAP',
        structured_note: {
          subjective: editedFields.subjective,
          objective: editedFields.objective,
          assessment: editedFields.assessment,
          plan: editedFields.plan,
        },
        detected_patterns: editedFields.detected_patterns,
        alerts: editedFields.alerts,
      })
      setConfirmed(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try { await onDelete() } finally { setDeleting(false); setShowDeleteConfirm(false) }
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

      {/* Edit hint */}
      {!readOnly && !compact && (
        <p className="font-sans text-[11px] text-right mb-4" style={{ color: MUTED }}>
          Toca cualquier campo para editar
        </p>
      )}

      {/* SOAP sections */}
      {hasStructuredNote && SECTIONS.map(({ key, label }, sectionIndex) => {
        const content = editedFields[key]
        const hasContent = !!content
        const isActive = activeField === key
        return (
          <div key={key} className={sectionIndex > 0 ? (compact ? 'mt-6' : 'mt-8') : ''}>
            <p
              className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase"
              style={{ fontVariant: 'small-caps', color: hasContent ? SAGE : MUTED }}
            >
              {label}
            </p>
            <hr className="border-0 border-t border-current mt-1 mb-3" style={{ color: hasContent ? `${SAGE}33` : `${MUTED}33` }} />
            {!readOnly && isActive ? (
              <textarea
                autoFocus
                defaultValue={content}
                className="font-serif text-[15px] leading-relaxed w-full resize-none rounded-md p-2 outline-none"
                style={{ border: `1.5px solid ${SAGE}`, background: '#fffef9', color: INK, overflow: 'hidden' }}
                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                onBlur={(e) => { setEditedFields(prev => ({ ...prev, [key]: e.target.value })); setActiveField(null) }}
              />
            ) : (
              <p
                className="font-serif text-[15px] leading-relaxed rounded-md p-2"
                style={{
                  color: INK,
                  cursor: readOnly ? 'default' : 'text',
                  border: readOnly ? 'none' : '1.5px dashed #d1d5db',
                }}
                onClick={() => !readOnly && setActiveField(key)}
              >
                {content || <span style={{ color: MUTED }}>—</span>}
              </p>
            )}
          </div>
        )
      })}

      {/* Alerts */}
      {(editedFields.alerts.length > 0 || !readOnly) && (
        <div className="mt-8">
          <p className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase text-red-600 mb-2">
            Alertas detectadas
          </p>
          {readOnly ? (
            <ul className="font-sans text-[14px] text-red-700 space-y-1 list-disc pl-4">
              {editedFields.alerts.map((a, i) => (
                <li key={i}>{a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {editedFields.alerts.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[12px] font-sans px-3 py-1 rounded-full">
                  {a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                  <button
                    onClick={() => setEditedFields(prev => ({
                      ...prev,
                      alerts: prev.alerts.filter((_, idx) => idx !== i),
                    }))}
                    className="ml-1 text-red-500 hover:text-red-700 font-bold leading-none"
                    aria-label="Eliminar alerta"
                  >
                    ×
                  </button>
                </span>
              ))}
              {newAlertInput ? (
                <input
                  autoFocus
                  type="text"
                  placeholder="Nueva alerta…"
                  className="font-sans text-[12px] border border-red-300 rounded-full px-3 py-1 outline-none"
                  style={{ background: '#fef2f2' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      setEditedFields(prev => ({ ...prev, alerts: [...prev.alerts, e.target.value.trim()] }))
                      setNewAlertInput(false)
                    } else if (e.key === 'Escape') {
                      setNewAlertInput(false)
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      setEditedFields(prev => ({ ...prev, alerts: [...prev.alerts, e.target.value.trim()] }))
                    }
                    setNewAlertInput(false)
                  }}
                />
              ) : (
                <button
                  onClick={() => setNewAlertInput(true)}
                  className="inline-flex items-center font-sans text-[12px] text-red-600 border border-dashed border-red-300 rounded-full px-3 py-1 hover:bg-red-50 transition-colors"
                  aria-label="+ Agregar"
                >
                  + Agregar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Patterns */}
      {(editedFields.detected_patterns.length > 0 || !readOnly) && (
        <div className="mt-6">
          <p className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase text-[#c4935a] mb-2">
            Patrones evolutivos
          </p>
          {readOnly ? (
            <ul className="font-sans text-[14px] text-[#92681e] space-y-1 list-disc pl-4">
              {editedFields.detected_patterns.map((p, i) => (
                <li key={i}>{p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {editedFields.detected_patterns.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[12px] font-sans px-3 py-1 rounded-full">
                  {p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                  <button
                    onClick={() => setEditedFields(prev => ({
                      ...prev,
                      detected_patterns: prev.detected_patterns.filter((_, idx) => idx !== i),
                    }))}
                    className="ml-1 text-amber-500 hover:text-amber-700 font-bold leading-none"
                    aria-label="Eliminar patrón"
                  >
                    ×
                  </button>
                </span>
              ))}
              {newPatternInput ? (
                <input
                  autoFocus
                  type="text"
                  placeholder="Nuevo patrón…"
                  className="font-sans text-[12px] border border-amber-300 rounded-full px-3 py-1 outline-none"
                  style={{ background: '#fffbeb' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      setEditedFields(prev => ({ ...prev, detected_patterns: [...prev.detected_patterns, e.target.value.trim()] }))
                      setNewPatternInput(false)
                    } else if (e.key === 'Escape') {
                      setNewPatternInput(false)
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      setEditedFields(prev => ({ ...prev, detected_patterns: [...prev.detected_patterns, e.target.value.trim()] }))
                    }
                    setNewPatternInput(false)
                  }}
                />
              ) : (
                <button
                  onClick={() => setNewPatternInput(true)}
                  className="inline-flex items-center font-sans text-[12px] text-[#c4935a] border border-dashed border-amber-300 rounded-full px-3 py-1 hover:bg-amber-50 transition-colors"
                  aria-label="+ Agregar"
                >
                  + Agregar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <p className="font-sans mt-4 text-[13px] text-red-600">{saveError}</p>
      )}

      {/* CTA bar — only when not readOnly and there is a structured note */}
      {!readOnly && hasStructuredNote && (
        <div className="mt-8 flex items-center gap-2">
          {!confirmed && onDelete && (
            showDeleteConfirm ? (
              <div className="flex items-center gap-2 mr-auto">
                <span className="font-sans text-[12px] text-red-600">¿Eliminar nota?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="font-sans text-[12px] text-red-600 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="font-sans text-[12px] text-ink-muted px-2 py-1.5"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="mr-auto font-sans text-[13px] font-medium text-red-500 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50 transition-colors"
              >
                Borrar nota
              </button>
            )
          )}
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

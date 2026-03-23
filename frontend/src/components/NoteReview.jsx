import { useState } from 'react'
import { confirmNote } from '../api'

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

const SOAP_SECTIONS = [
  {
    key: 'subjective',
    letter: 'S',
    label: 'Subjetivo',
    border: 'border-sage/20',
    headerBg: 'bg-sage-light',
    labelColor: 'text-sage-dark',
  },
  {
    key: 'objective',
    letter: 'O',
    label: 'Objetivo',
    border: 'border-sky-200/60',
    headerBg: 'bg-sky-50',
    labelColor: 'text-sky-700',
  },
  {
    key: 'assessment',
    letter: 'A',
    label: 'Análisis',
    border: 'border-amber-200/60',
    headerBg: 'bg-amber-50',
    labelColor: 'text-amber-800',
  },
  {
    key: 'plan',
    letter: 'P',
    label: 'Plan',
    border: 'border-emerald-200/60',
    headerBg: 'bg-emerald-50',
    labelColor: 'text-emerald-800',
  },
]

export default function NoteReview({ noteData, onConfirm }) {
  const parsedNote = !noteData.clinical_note && noteData.text_fallback
    ? parseSoapText(noteData.text_fallback)
    : null
  const clinicalNote = noteData.clinical_note || parsedNote
  const noteContent = clinicalNote?.structured_note || {}
  const alerts = noteData.clinical_note?.alerts || []
  const patterns = noteData.clinical_note?.detected_patterns || []
  const evolutionReport = noteData.evolution_report

  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const sid = noteData.clinical_note?.session_id || noteData.note_id
      const payload = {
        ...noteData.clinical_note,
        format: 'SOAP',
      }
      if (!sid) {
        alert('ID de sesión extraviado. No se guardará.')
        return
      }
      await confirmNote(sid, payload)
      setConfirmed(true)
      if (onConfirm) onConfirm()
    } catch (err) {
      alert('Error en la conexión con la base de datos: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = () => {
    if (!evolutionReport) return

    let content = `--- HISTORIAL / REPORTE DE EVOLUCIÓN (SYQUEX) ---\n\n`
    content += `RESUMEN:\n${evolutionReport.summary || 'No disponible'}\n\n`
    if (evolutionReport.key_themes?.length > 0) {
      content += `TEMAS CLAVE (HISTÓRICOS):\n- ${evolutionReport.key_themes.join('\n- ')}\n\n`
    }
    if (evolutionReport.risk_factors?.length > 0) {
      content += `FACTORES DE RIESGO:\n- ${evolutionReport.risk_factors.join('\n- ')}\n`
    }

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `historial_clinico_syquex_${new Date().toISOString().split('T')[0]}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="font-sans">

      {/* Texto conversacional libre */}
      {noteData.text_fallback && (
        <p className="text-[14px] leading-relaxed text-ink-secondary whitespace-pre-wrap mb-4">
          {noteData.text_fallback}
        </p>
      )}

      {/* Documento clínico — solo cuando hay clinical_note */}
      {clinicalNote && (
        <div className="bg-white border border-ink/[0.07] rounded-2xl p-5 sm:p-6">

          {/* Header del documento */}
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-ink/[0.06]">
            <span className="text-[10px] uppercase tracking-[0.14em] text-sage font-bold">
              Nota Clínica · SOAP
            </span>
          </div>

          {/* Cards SOAP */}
          <div className="space-y-2 mb-4">
            {SOAP_SECTIONS.map(({ key, letter, label, border, headerBg, labelColor }) => {
              const content = noteContent[key]
              if (!content) return null
              return (
                <div key={key} className={`rounded-xl overflow-hidden border ${border}`}>
                  <div className={`${headerBg} px-3.5 py-1.5 flex items-center gap-2`}>
                    <span className={`text-[13px] font-black font-mono ${labelColor}`}>
                      {letter}
                    </span>
                    <span className={`text-[10px] uppercase tracking-[0.14em] font-bold ${labelColor}`}>
                      {label}
                    </span>
                  </div>
                  <div className="bg-white px-3.5 py-2.5">
                    <p className="text-[14px] leading-relaxed text-ink-secondary">{content}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Alertas detectadas */}
          {alerts.length > 0 && (
            <div className="mt-3 bg-red-50 border border-red-200/60 rounded-xl p-3">
              <strong className="text-[10px] uppercase tracking-[0.12em] font-bold text-red-700 block mb-1">
                ⚠ Alertas Detectadas
              </strong>
              <ul className="list-disc pl-5 text-red-800 text-[13px] space-y-1">
                {alerts.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {/* Patrones evolutivos */}
          {patterns.length > 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-200/60 rounded-xl p-3">
              <strong className="text-[10px] uppercase tracking-[0.12em] font-bold text-amber-700 block mb-1">
                🔄 Patrones Evolutivos
              </strong>
              <ul className="list-disc pl-5 text-amber-800 text-[13px] space-y-1">
                {patterns.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {/* CTA bar — último hijo del contenedor */}
          <div className="flex items-center justify-between gap-3 border-t border-ink/[0.06] pt-4 mt-4">

            {/* Izquierda: Descargar historial */}
            <button
              onClick={handleDownload}
              disabled={!evolutionReport}
              className={`border border-ink/[0.10] text-ink-secondary text-[13px] font-medium rounded-xl px-4 py-2 flex items-center gap-2 transition-colors ${
                evolutionReport ? 'hover:bg-parchment-dark' : 'opacity-40 cursor-not-allowed'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {evolutionReport ? 'Descargar Historial TXT' : 'Historial no solicitado'}
            </button>

            {/* Derecha: BORRADOR pill + Confirmar */}
            <div className="flex items-center gap-2">
              {!confirmed && (
                <span className="bg-parchment-dark text-ink-tertiary text-[11px] font-semibold tracking-[0.06em] rounded-full px-3 py-1">
                  BORRADOR
                </span>
              )}

              {!confirmed ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`bg-sage text-white text-[13px] font-medium rounded-xl px-4 py-2 transition-colors ${
                    saving ? 'opacity-70 cursor-not-allowed' : 'hover:bg-sage-dark'
                  }`}
                >
                  {saving ? 'Registrando...' : (
                    <>
                      <span className="sm:hidden">✓ Confirmar</span>
                      <span className="hidden sm:inline">✓ Confirmar en Expediente</span>
                    </>
                  )}
                </button>
              ) : (
                <span className="text-emerald-600 text-[13px] font-medium flex items-center gap-1 px-4 py-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Guardado
                </span>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Caso: solo evolutionReport sin clinical_note */}
      {!clinicalNote && evolutionReport && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={handleDownload}
            className="border border-ink/[0.10] text-ink-secondary text-[13px] font-medium rounded-xl px-4 py-2 flex items-center gap-2 hover:bg-parchment-dark transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Descargar Historial TXT
          </button>
        </div>
      )}

    </div>
  )
}

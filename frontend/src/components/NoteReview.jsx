import { useState } from 'react'
import { confirmNote } from '../api'

export default function NoteReview({ noteData, onConfirm }) {
  const noteContent = noteData.clinical_note?.structured_note || {};
  const alerts = noteData.clinical_note?.alerts || [];
  const patterns = noteData.clinical_note?.detected_patterns || [];
  const evolutionReport = noteData.evolution_report;

  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sid = noteData.clinical_note?.session_id || noteData.note_id; 
      const payload = {
        ...noteData.clinical_note,
        format: "SOAP"
      };
      
      if (!sid) {
          alert('ID de sesión extraviado. No se guardará.');
          return;
      }
      await confirmNote(sid, payload);
      setConfirmed(true);
      if (onConfirm) onConfirm();
    } catch (err) {
      alert("Error en la conexión con la base de datos: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!evolutionReport) return;

    let content = `--- HISTORIAL / REPORTE DE EVOLUCIÓN (SYQUEX) ---\n\n`;
    content += `RESUMEN:\n${evolutionReport.summary || 'No disponible'}\n\n`;
    
    if (evolutionReport.key_themes?.length > 0) {
      content += `TEMAS CLAVE (HISTÓRICOS):\n- ${evolutionReport.key_themes.join('\n- ')}\n\n`;
    }
    if (evolutionReport.risk_factors?.length > 0) {
      content += `FACTORES DE RIESGO:\n- ${evolutionReport.risk_factors.join('\n- ')}\n`;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historial_clinico_syquex_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="text-slate-200 font-sans text-[15px] leading-relaxed">
      
      {/* Texto conversacional libre (si Claude no usó tools o decidió charlar) */}
      {noteData.text_fallback && (
        <p className="mb-4 whitespace-pre-wrap">{noteData.text_fallback}</p>
      )}

      {/* Texto Puro del Chat (sin textareas) */}
      {(noteContent.subjective || noteContent.objective || noteContent.assessment || noteContent.plan) && (
        <div className="space-y-4 mb-5">
          {noteContent.subjective && <p><strong className="text-cyan-400">Subjetivo:</strong> {noteContent.subjective}</p>}
          {noteContent.objective && <p><strong className="text-cyan-400">Objetivo:</strong> {noteContent.objective}</p>}
          {noteContent.assessment && <p><strong className="text-cyan-400">Análisis:</strong> {noteContent.assessment}</p>}
          {noteContent.plan && <p><strong className="text-cyan-400">Plan:</strong> {noteContent.plan}</p>}
        
        {alerts.length > 0 && (
          <div className="mt-3 p-3 bg-red-950/20 border border-red-900/40 rounded-xl">
            <strong className="text-red-400 block mb-1 text-sm">⚠️ Alertas Detectadas:</strong>
            <ul className="list-disc pl-5 text-red-300 text-sm space-y-1">
              {alerts.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}
        
        {patterns.length > 0 && (
          <div className="mt-3 p-3 bg-amber-950/20 border border-amber-900/40 rounded-xl">
            <strong className="text-amber-400 block mb-1 text-sm">🔄 Patrones Evolutivos:</strong>
            <ul className="list-disc pl-5 text-amber-300 text-sm space-y-1">
              {patterns.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
      </div>
      )}

      {/* Botonera Austera (Solo si hay contenido clínico o historia) */}
      {(noteData.clinical_note || evolutionReport) && (
        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-800">
          <button 
            onClick={handleDownload}
            disabled={!evolutionReport}
            className={`text-[13px] font-medium py-1.5 px-4 rounded-lg flex items-center gap-2 transition-all border ${
              evolutionReport 
              ? "bg-[#111e38] hover:bg-[#1a2d52] text-slate-100 border-cyan-700/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]" 
              : "bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            {evolutionReport ? "Descargar Historial TXT" : "Historial no solicitado"}
          </button>

          {!confirmed ? (
            <button 
              onClick={handleSave}
              disabled={saving}
              className="text-[13px] font-medium bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-300 py-1.5 px-4 rounded-lg flex items-center gap-2 transition-colors border border-cyan-800/50"
            >
              {saving ? "Registrando..." : "✓ Confirmar Expediente"}
            </button>
          ) : (
            <span className="text-[13px] py-1.5 px-4 text-emerald-400 flex items-center gap-1 font-medium bg-emerald-900/10 rounded-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              Guardado
            </span>
          )}
        </div>
      )}

    </div>
  )
}

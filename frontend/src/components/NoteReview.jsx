import { useState } from 'react'
import { confirmNote } from '../api'

export default function NoteReview({ noteData, originalDictation, onConfirm, onBack }) {
  const noteContent = noteData.clinical_note?.structured_note || {};
  const alerts = noteData.clinical_note?.alerts || [];
  const patterns = noteData.clinical_note?.detected_patterns || [];
  const suggestions = noteData.suggestions || {};

  const [editableSections, setEditableSections] = useState({
    subjective: noteContent.subjective || '',
    objective: noteContent.objective || '',
    assessment: noteContent.assessment || '',
    plan: noteContent.plan || ''
  });
  
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // noteData.clinical_note.session_id holds the session ID (from our mock / tool)
      const sid = noteData.clinical_note?.session_id || noteData.note_id; 
      
      const payload = {
        ...noteData.clinical_note,
        structured_note: editableSections,
        format: noteData.clinical_note?.format || "SOAP"
      };
      
      if (!sid) {
          alert('No session ID to confirm.');
          return;
      }

      await confirmNote(sid, payload);
      onConfirm();
    } catch (err) {
      alert("Error guardando la nota: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, val) => {
    setEditableSections(prev => ({...prev, [field]: val}));
  };

  const Section = ({ title, field }) => (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wider">{title}</label>
      <textarea
        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-200 font-mono text-sm leading-relaxed focus:border-teal-500 focus:outline-none min-h-[100px]"
        value={editableSections[field]}
        onChange={(e) => handleChange(field, e.target.value)}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="col-span-2 bg-slate-800 p-6 rounded-lg shadow-md border border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-teal-400">Revisión de Nota Clínica</h2>
          <button 
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← Volver a editar dictado
          </button>
        </div>

        <div className="space-y-2">
          <Section title="Subjetivo" field="subjective" />
          <Section title="Objetivo" field="objective" />
          <Section title="Análisis" field="assessment" />
          <Section title="Plan" field="plan" />
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-teal-600 hover:bg-teal-500 text-white font-medium py-3 px-8 rounded flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {saving ? "Guardando..." : "✓ Confirmar y guardar nota"}
          </button>
        </div>
      </div>

      <div className="col-span-1 space-y-4">
        {alerts.length > 0 && (
          <div className="bg-red-900/30 border border-red-800/50 p-4 rounded-lg">
            <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
              <span className="text-xl">🔴</span> Alertas Clínicas
            </h3>
            <ul className="list-disc pl-5 text-sm text-red-200 space-y-1">
              {alerts.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {patterns.length > 0 && (
          <div className="bg-amber-900/30 border border-amber-800/50 p-4 rounded-lg">
            <h3 className="text-amber-400 font-semibold mb-2 flex items-center gap-2">
              <span className="text-xl">🟡</span> Patrones Detectados
            </h3>
            <ul className="list-disc pl-5 text-sm text-amber-200 space-y-1">
              {patterns.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {suggestions?.priority_areas && (
          <div className="bg-emerald-900/30 border border-emerald-800/50 p-4 rounded-lg">
            <h3 className="text-emerald-400 font-semibold mb-2 flex items-center gap-2">
              <span className="text-xl">🟢</span> Próxima Sesión Sugerida
            </h3>
            <div className="text-sm text-emerald-200 space-y-3">
              <div>
                <strong className="block text-emerald-300">Áreas prioritarias:</strong>
                <ul className="list-disc pl-5">{suggestions.priority_areas.map((x,i)=><li key={i}>{x}</li>)}</ul>
              </div>
              <div>
                <strong className="block text-emerald-300">Preguntas sugeridas:</strong>
                <ul className="list-disc pl-5">{suggestions.suggested_questions?.map((x,i)=><li key={i}>{x}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

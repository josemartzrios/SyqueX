import { useState } from 'react'
import { processSession } from '../api'

export default function ChatInput({ patientId, onNoteGenerated }) {
  const [dictation, setDictation] = useState('');
  const [format, setFormat] = useState('SOAP');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const handleProcess = async () => {
    if (!dictation.trim()) return;
    setLoading(true);
    setStatusText('Recuperando historial... / Detectando patrones... / Generando nota...');
    
    try {
      const result = await processSession(patientId, dictation, format);
      onNoteGenerated(result, dictation);
    } catch (err) {
      alert("Error procesando sesión: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800 p-6 rounded-lg shadow-md border border-slate-700">
      <h2 className="text-xl font-semibold mb-4 text-teal-400">Dictado de Sesión</h2>
      
      <textarea 
        className="w-full h-40 p-3 bg-slate-900 border border-slate-600 rounded text-slate-100 placeholder-slate-400 font-sans focus:outline-none focus:border-teal-500 transition-colors"
        placeholder="Describe libremente cómo fue la sesión..."
        value={dictation}
        onChange={(e) => setDictation(e.target.value)}
        disabled={loading}
      />
      
      <div className="flex items-center justify-between mt-4">
        <select 
          className="bg-slate-900 border border-slate-600 text-slate-200 p-2 rounded focus:outline-none focus:border-teal-500"
          value={format} 
          onChange={(e) => setFormat(e.target.value)}
          disabled={loading}
        >
          <option value="SOAP">Formato SOAP</option>
          <option value="DAP">Formato DAP</option>
          <option value="BIRP">Formato BIRP</option>
        </select>
        
        <button 
          onClick={handleProcess}
          disabled={loading || !dictation.trim()}
          className="bg-teal-600 hover:bg-teal-500 text-white font-medium py-2 px-6 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{statusText.split('/')[0]}</span>
            </>
          ) : (
            "Procesar sesión →"
          )}
        </button>
      </div>
      {loading && <p className="text-sm text-slate-400 mt-3 text-center animate-pulse">{statusText}</p>}
    </div>
  )
}

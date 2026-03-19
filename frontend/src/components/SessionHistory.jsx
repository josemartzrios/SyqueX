import { useState, useEffect } from 'react'
import { searchHistory, getPatientSessions } from '../api'

export default function SessionHistory({ patientId }) {
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!patientId) return;
      try {
        const history = await getPatientSessions(patientId);
        setSessions(history);
      } catch (err) {
        console.error("Error loading sessions", err);
      }
    }
    load();
  }, [patientId]);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchHistory(patientId, query);
        setResults(res);
      } catch (err) {
        console.error("Error searching", err);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, patientId]);

  const displayList = query.length >= 3 ? results : sessions;

  return (
    <div className="bg-slate-800 p-6 rounded-lg shadow-md border border-slate-700 h-full flex flex-col">
      <h2 className="text-xl font-semibold mb-6 text-teal-400">Historial</h2>
      
      <div className="relative mb-6">
        <span className="absolute left-3 top-2.5 text-slate-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </span>
        <input 
          type="text" 
          placeholder="Busca en el historial..." 
          className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-600 rounded text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <span className="absolute right-3 top-3 w-4 h-4 rounded-full border-2 border-slate-500 border-t-teal-500 animate-spin"></span>}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
        {displayList.map((item, idx) => (
          <div key={item.id || idx} className="p-4 bg-slate-900/50 border border-slate-700 rounded hover:border-slate-500 hover:bg-slate-800 transition-colors cursor-pointer group">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-teal-300">
                Sesión {item.session_number}
              </span>
              <span className="text-xs text-slate-500">
                {item.session_date || item.date}
              </span>
            </div>
            <p className="text-sm text-slate-400 line-clamp-3 group-hover:text-slate-300 transition-colors">
              {item.note?.assessment || item.summary_fragment || 'No hay resumen disponible.'}
            </p>
            {item.relevance_score && (
              <div className="mt-2 text-xs text-teal-500 opacity-70">Relevancia semántica ↑</div>
            )}
          </div>
        ))}
        {displayList.length === 0 && !loading && (
          <div className="text-center text-slate-500 text-sm mt-10">
            {query.length >= 3 ? "No se encontraron coincidencias." : "No hay sesiones guardadas."}
          </div>
        )}
      </div>
    </div>
  )
}

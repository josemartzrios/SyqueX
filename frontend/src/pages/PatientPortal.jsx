import { useState, useEffect } from 'react';
import { clearPatientToken, getPatientSummaries, getPatientSummaryDetail } from '../patientApi';
import { navigateTo } from '../auth';

export default function PatientPortal() {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  useEffect(() => {
    // El body global tiene overflow:hidden para el app del psicólogo — lo sobreescribimos aquí
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = 'hidden'; };
  }, []);

  useEffect(() => {
    loadSummaries();
  }, []);

  const loadSummaries = async () => {
    setLoading(true);
    try {
      const data = await getPatientSummaries();
      setSummaries(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (summaryId) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const detail = await getPatientSummaryDetail(summaryId);
      setSelectedSummary(detail);
      setSummaries(prev => prev.map(s => s.id === summaryId ? { ...s, viewed_at: detail.viewed_at } : s));
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleLogout = () => {
    clearPatientToken();
    navigateTo('/portal/login');
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fefaf6] flex items-center justify-center">
        <div className="animate-pulse text-[#5a9e8a] font-medium text-lg">Cargando tu portal...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fefaf6] font-sans pb-12">
      {/* Header */}
      <nav className="bg-white border-b border-[#18181b]/[0.06] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#5a9e8a] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <span className="font-serif text-xl text-[#18181b] hidden sm:block">SyqueX</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-[#9ca3af] hover:text-[#18181b] transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* List Section */}
          <div className="md:col-span-1 md:sticky md:top-[88px] md:max-h-[calc(100vh-104px)] md:overflow-y-auto md:pr-1">
            <h1 className="text-2xl font-serif text-[#18181b] mb-6">Mis Sesiones</h1>
            {error && (
              <div className="mb-4 flex items-center gap-2 bg-[#fef2f2] border border-red-200 rounded-xl px-3 py-2.5">
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[9px] font-bold">!</span>
                </div>
                <p className="text-[12px] text-red-600">{error}</p>
              </div>
            )}
            <div className="space-y-3">
              {summaries.length === 0 ? (
                <div className="bg-white p-6 rounded-2xl border border-dashed border-[#18181b]/[0.1] text-center">
                  <p className="text-[#9ca3af] text-sm">Aún no tienes resúmenes disponibles.</p>
                </div>
              ) : (
                summaries.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleViewDetail(s.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedSummary?.id === s.id
                      ? 'bg-[#5a9e8a]/5 border-[#5a9e8a] shadow-sm'
                      : 'bg-white border-[#18181b]/[0.06] hover:border-[#5a9e8a]/30'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
                        {new Date(s.sent_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                      {!s.viewed_at && (
                        <span className="w-2 h-2 bg-[#5a9e8a] rounded-full"></span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#18181b] truncate">
                      {s.topics_worked || 'Sesión sin título'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detail Section */}
          <div className="md:col-span-2">
            {detailError && (
              <div className="mb-4 flex items-center gap-2 bg-[#fef2f2] border border-red-200 rounded-xl px-3 py-2.5">
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[9px] font-bold">!</span>
                </div>
                <p className="text-[12px] text-red-600">{detailError}</p>
              </div>
            )}
            {loadingDetail ? (
              <div className="bg-white rounded-3xl border border-[#18181b]/[0.06] p-12 flex items-center justify-center h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5a9e8a]"></div>
              </div>
            ) : selectedSummary ? (
              <div className="bg-white rounded-3xl border border-[#18181b]/[0.06] shadow-sm overflow-hidden">
                <div className="p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5a9e8a]">Resumen de Sesión</span>
                      <p className="text-[15px] font-medium text-[#18181b] mt-0.5">
                        {new Date(selectedSummary.sent_at).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>

                  </div>

                  <div className="space-y-8">
                    <section>
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af] mb-3 pb-1 border-b border-[#18181b]/[0.04]">
                        Temas Trabajados
                      </h3>
                      <p className="text-[#18181b] leading-relaxed whitespace-pre-wrap">
                        {selectedSummary.topics_worked}
                      </p>
                    </section>

                    {selectedSummary.homework && (
                      <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#5a9e8a] mb-3 pb-1 border-b border-[#5a9e8a]/10">
                          Tareas y Propósitos
                        </h3>
                        <div className="bg-[#5a9e8a]/[0.02] p-4 rounded-2xl border border-[#5a9e8a]/5">
                          <p className="text-[#18181b] leading-relaxed whitespace-pre-wrap italic">
                            {selectedSummary.homework}
                          </p>
                        </div>
                      </section>
                    )}
                  </div>

                  {selectedSummary.next_session_date && (
                    <section style={{ marginTop: '24px' }}>
                      <div className="bg-[#fefaf6] px-4 py-2 rounded-xl border border-[#5a9e8a]/20">
                        <p className="text-[10px] font-bold uppercase text-[#5a9e8a] mb-0.5">Próxima Sesión</p>
                        <p className="text-sm font-medium text-[#18181b]">
                          {new Date(selectedSummary.next_session_date).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short'
                          })}
                        </p>
                      </div>
                    </section>
                  )}
                </div>

                <div className="bg-[#f4f4f2]/30 px-8 py-4 border-t border-[#18181b]/[0.04]">
                  <p className="text-[11px] text-[#9ca3af] text-center italic">
                    Este resumen es para tu referencia personal y apoyo en tu proceso terapéutico.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-dashed border-[#18181b]/[0.1] p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                <div className="w-16 h-16 bg-[#fefaf6] rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="text-lg font-serif text-[#18181b]">Selecciona una sesión</h3>
                <p className="text-sm text-[#9ca3af] mt-2 max-w-xs">
                  Toca uno de tus resúmenes en la lista para ver los detalles.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

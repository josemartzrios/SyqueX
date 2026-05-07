import { useState } from 'react';
import { navigateTo } from '../auth';
import { resetPatientPassword } from '../patientApi';

export default function PatientResetPassword({ resetToken, setScreen }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await resetPatientPassword(resetToken, newPassword);
      setSuccess(true);
      setTimeout(() => {
        navigateTo('/portal');
        setScreen('patient-portal');
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f2] flex flex-col md:flex-row font-sans">
      
      {/* Sage panel */}
      <div className="bg-[#5a9e8a] px-6 py-8 md:w-[42%] md:min-h-screen md:flex md:flex-col md:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-6">
            <span className="text-white text-[15px] font-bold tracking-tight">SyqueX</span>
          </div>
          <h1 className="text-white text-[22px] font-bold font-serif leading-snug mb-2">
            Nueva contraseña
          </h1>
          <p className="text-white/70 text-[13px] leading-relaxed">
            Portal del Paciente
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 bg-white px-6 py-8 md:flex md:items-center md:justify-center">
        <div className="w-full max-w-sm">
          {success ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#f0faf7] flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-[#5a9e8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-[18px] font-bold font-serif text-[#18181b]">
                ¡Contraseña actualizada!
              </h2>
              <p className="text-[13px] text-[#9ca3af]">
                Redirigiendo a tu portal...
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-[18px] font-bold font-serif text-[#18181b] mb-6">
                Crea tu nueva contraseña
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 bg-[#fef2f2] border border-red-300 rounded-xl px-3 py-2.5">
                    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[9px] font-bold">!</span>
                    </div>
                    <p className="text-[12px] text-red-600">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98] text-white rounded-xl py-2.5 text-[14px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? 'Actualizando...' : 'Guardar y entrar →'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

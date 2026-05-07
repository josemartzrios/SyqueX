import { useState } from 'react';
import { navigateTo } from '../auth';
import { patientLogin, requestPatientPasswordReset } from '../patientApi';

export default function PatientLogin({ setScreen }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await patientLogin(email, password);
      navigateTo('/portal');
      setScreen('patient-portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'sent'
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState(null);

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    try {
      await requestPatientPasswordReset(forgotEmail);
      setMode('sent');
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f2] flex flex-col md:flex-row font-sans">

      {/* Sage panel — header en móvil, columna izquierda en desktop */}
      <div className="bg-[#5a9e8a] px-6 py-8 md:w-[42%] md:min-h-screen md:flex md:flex-col md:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-6">

            <span className="text-white text-[15px] font-bold tracking-tight">SyqueX</span>
          </div>
          <h1 className="text-white text-[22px] font-bold font-serif leading-snug mb-2">
            Portal del paciente
          </h1>
          <p className="text-white/70 text-[13px] leading-relaxed">
            Accede a los resúmenes de tus sesiones en un espacio privado.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 mt-8 pt-6 border-t border-white/[0.18]">
          <svg className="w-3.5 h-3.5 text-white/55 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-white/55 text-[11px]">Datos encriptados</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 bg-white px-6 py-8 md:flex md:items-center md:justify-center">
        <div className="w-full max-w-sm">
          {mode === 'login' && (
            <>
              <h2 className="text-[18px] font-bold font-serif text-[#18181b] mb-6">
                Inicia sesión
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  {loading ? 'Iniciando sesión…' : 'Entrar al portal →'}
                </button>
                <hr className="border-black/[0.06]" />
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="w-full text-[9px] text-[#5a9e8a] text-center underline hover:no-underline transition-all"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </form>
            </>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <h2 className="text-[18px] font-bold font-serif text-[#18181b] mb-1">
                  Recuperar contraseña
                </h2>
                <p className="text-[12px] text-[#9ca3af] mb-4 leading-relaxed">
                  Te enviaremos un link para crear una nueva contraseña.
                </p>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#5a9e8a] uppercase tracking-[0.1em] mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full bg-[#f4f4f2] border border-black/[0.08] rounded-xl px-3 py-2.5 text-[14px] text-[#18181b] focus:outline-none focus:border-[#5a9e8a]/60 focus:ring-1 focus:ring-[#5a9e8a]/20 transition-all"
                />
              </div>
              {forgotError && (
                <div className="flex items-center gap-2.5 bg-[#fef2f2] border border-red-300 rounded-xl px-3 py-2.5">
                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[9px] font-bold">!</span>
                  </div>
                  <p className="text-[12px] text-red-600">{forgotError}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-[#5a9e8a] hover:bg-[#4a8a78] active:scale-[0.98] text-white rounded-xl py-2.5 text-[14px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {forgotLoading ? 'Enviando…' : 'Enviar link de recuperación →'}
              </button>
              <hr className="border-black/[0.06]" />
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-[12px] text-[#9ca3af] text-center hover:text-[#18181b] transition-colors"
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          )}

          {mode === 'sent' && (
            <div className="space-y-4">
              <div className="bg-[#f0faf7] border border-[#5a9e8a] rounded-xl px-3 py-3 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#5a9e8a] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold font-serif text-[#5a9e8a]">Revisa tu correo</p>
                  <p className="text-[11px] text-[#9ca3af] mt-1 leading-relaxed">
                    Si esa dirección tiene una cuenta activa, recibirás un link en los próximos minutos.
                  </p>
                </div>
              </div>
              <hr className="border-black/[0.06]" />
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-[12px] text-[#9ca3af] text-center hover:text-[#18181b] transition-colors"
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          )}

          {mode === 'login' && (
            <div className="flex items-center justify-center gap-1.5 mt-6 md:hidden">
              <svg className="w-3 h-3 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-[11px] text-[#9ca3af]">Datos encriptados · Solo tú los ves</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

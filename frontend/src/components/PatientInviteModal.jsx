import { useState } from 'react';
import { invitePatient, resendPatientInvite } from '../api';

export default function PatientInviteModal({ open, patient, onClose, onSuccess, onStatusUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!open || !patient) return null;

  const isResend = patient.portal_status === 'invited';

  const handleAction = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isResend) {
        await resendPatientInvite(patient.id);
      } else {
        await invitePatient(patient.id);
        onSuccess?.();
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2500);
    } catch (err) {
      setError(err.message || 'Error al enviar la invitación');
      if (err.status === 409) {
        onStatusUpdate?.(err.message?.includes('activó') ? 'active' : 'invited');
      }
    } finally {
      setLoading(false);
    }
  };

  const title = isResend ? 'Reenviar invitación' : 'Invitar al Portal';
  const description = isResend
    ? `¿Deseas reenviarle la invitación a ${patient.name}? Se generará un nuevo enlace y el anterior quedará inválido.`
    : `¿Deseas invitar a ${patient.name} al portal del paciente? Recibirá un correo para crear su contraseña y acceder a sus tareas y resúmenes.`;
  const buttonLabel = isResend ? 'Reenviar invitación' : 'Enviar invitación';
  const successTitle = isResend ? 'Invitación reenviada' : 'Invitación enviada';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl flex flex-col items-center text-center">
        {!success ? (
          <>
            <div className="w-12 h-12 rounded-full bg-[#5a9e8a]/10 flex items-center justify-center mb-4 text-[#5a9e8a]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#18181b] mb-2">{title}</h3>
            <p className="text-sm text-ink-secondary mb-6">{description}</p>

            {error && (
              <p className="w-full text-[13px] text-red-600 bg-red-50 p-2 rounded-lg mb-4 text-left border border-red-100">
                {error}
              </p>
            )}

            <div className="flex w-full gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-2 rounded-xl text-[14px] font-medium text-[#18181b] bg-[#f4f4f2] hover:bg-[#eae8e5] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAction}
                disabled={loading}
                className="flex-1 py-2 rounded-xl text-[14px] font-medium text-white bg-[#5a9e8a] hover:bg-[#4a8a78] transition-colors flex items-center justify-center gap-2"
              >
                {loading ? 'Enviando...' : buttonLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4 text-green-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#18181b] mb-2">{successTitle}</h3>
            <p className="text-sm text-ink-secondary mb-2">
              El paciente recibirá un correo con las instrucciones de acceso.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

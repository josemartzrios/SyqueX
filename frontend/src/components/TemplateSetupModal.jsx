import { useState } from 'react';
import { saveTemplate } from '../api';
import TemplateWizard from './TemplateWizard';
import TemplatePdfUpload from './TemplatePdfUpload';

export default function TemplateSetupModal({ open, onClose, onSaved }) {
  const [path, setPath] = useState(null); // null | 'pdf' | 'wizard'

  if (!open) return null;

  const handleSave = async (fields) => {
    const saved = await saveTemplate(fields);
    onSaved?.(saved);
    onClose();
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-3 sm:px-4"
    >
      <div className="bg-white border border-ink/[0.08] rounded-2xl shadow-xl max-w-lg w-full flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between flex-shrink-0 border-b border-ink/[0.06]">
          <div>
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#5a9e8a] font-bold block mb-0.5">
              {path ? (path === 'pdf' ? 'Subir nota de muestra' : 'Diseñar nota') : 'Tu nota clínica'}
            </span>
            <h2 className="text-[#18181b] text-lg font-semibold leading-snug">
              {path ? 'Configura tu nota' : '¿Cómo quieres documentar tus sesiones?'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#18181b] hover:bg-black/[0.04] transition-colors ml-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {path === null && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-ink-secondary mb-2">
                SyqueX aprenderá tu estilo clínico y generará cada nota automáticamente.
              </p>

              {/* Primary: PDF */}
              <button
                onClick={() => setPath('pdf')}
                className="w-full border-2 border-[#5a9e8a] rounded-xl p-5 text-left flex items-center gap-4 bg-[#f0f8f5] hover:bg-[#e8f5f0] transition-colors"
              >
                <svg className="w-8 h-8 text-[#5a9e8a] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold text-[#18181b] text-[14px]">Subir una nota que ya uso</p>
                  <p className="text-[12px] text-[#555] mt-0.5">Sube un PDF de ejemplo — el agente aprende tu estructura en segundos</p>
                </div>
                <span className="flex-shrink-0 bg-[#5a9e8a] text-white text-[11px] font-bold rounded-md px-2.5 py-1">
                  Recomendado
                </span>
              </button>

              {/* Secondary: Wizard */}
              <button
                onClick={() => setPath('wizard')}
                className="w-full border border-ink/[0.10] rounded-xl p-4 text-left flex items-center gap-4 bg-white hover:bg-[#fafafa] transition-colors"
              >
                <svg className="w-7 h-7 text-[#9ca3af] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="font-medium text-[#18181b] text-[14px]">No tengo notas en PDF — diseñar desde cero</p>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">Elige secciones y tipos de campo paso a paso</p>
                </div>
              </button>

              <button onClick={onClose} className="text-[11px] text-[#bbb] text-center mt-2 underline">
                Usar formato SOAP por ahora — configurar después
              </button>
            </div>
          )}

          {path === 'pdf' && (
            <TemplatePdfUpload
              onSave={handleSave}
              onCancel={() => setPath(null)}
            />
          )}

          {path === 'wizard' && (
            <TemplateWizard
              onSave={handleSave}
              onCancel={() => setPath(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

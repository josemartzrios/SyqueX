import { useState, useEffect } from 'react';

const STORAGE_KEY = (patientId) => `syquex_draft_${patientId}`;

export default function useDraft(patientId) {
  const [draft, setDraftState] = useState(
    () => (patientId ? localStorage.getItem(STORAGE_KEY(String(patientId))) ?? '' : '')
  );

  useEffect(() => {
    setDraftState(
      patientId ? localStorage.getItem(STORAGE_KEY(String(patientId))) ?? '' : ''
    );
  }, [patientId]);

  const setDraft = (text) => {
    setDraftState(text);
    if (!patientId) return;
    try {
      if (text) {
        localStorage.setItem(STORAGE_KEY(String(patientId)), text);
      } else {
        localStorage.removeItem(STORAGE_KEY(String(patientId)));
      }
    } catch {
      // localStorage full — textarea still works, draft just won't persist
    }
  };

  const clearDraft = () => {
    setDraftState('');
    if (patientId) localStorage.removeItem(STORAGE_KEY(String(patientId)));
  };

  return { draft, setDraft, clearDraft };
}

useDraft.hasDraft = (patientId) =>
  !!patientId && !!localStorage.getItem(STORAGE_KEY(String(patientId)));

useDraft.clearDraftFor = (patientId) => {
  if (patientId) localStorage.removeItem(STORAGE_KEY(String(patientId)));
};

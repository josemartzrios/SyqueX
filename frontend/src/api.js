const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000") + "/api/v1";

export async function processSession(patientId, dictation, format = 'SOAP') {
  const res = await fetch(`${API_BASE}/sessions/${patientId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_dictation: dictation, format })
  });
  if (!res.ok) throw new Error('Error processing session');
  return res.json();
}

export async function confirmNote(sessionId, noteData) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edited_note: noteData })
  });
  if (!res.ok) throw new Error('Error confirming note');
  return res.json();
}

export async function getPatientProfile(patientId) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/profile`);
  if (!res.ok) throw new Error('Error fetching profile');
  return res.json();
}

export async function getPatientSessions(patientId) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/sessions`);
  if (!res.ok) throw new Error('Error fetching sessions');
  const data = await res.json();
  return data.items;
}

export async function searchHistory(patientId, query) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Error searching history');
  return res.json();
}

export async function listPatients() {
  const res = await fetch(`${API_BASE}/patients`);
  if (!res.ok) throw new Error('Error fetching patients');
  return res.json();
}

export async function createPatient(name) {
  const res = await fetch(`${API_BASE}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, risk_level: 'low' })
  });
  if (!res.ok) throw new Error('Error creating patient');
  return res.json();
}

export async function listConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error('Error fetching conversations');
  const data = await res.json();
  return data.items;
}

export async function archiveSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/archive`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Error archiving session');
  return res.json();
}

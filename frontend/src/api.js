const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000") + "/api/v1";

export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function _handleResponse(res) {
  if (res.ok) return res.json();

  let detail = `Error ${res.status}`;
  let code = null;
  try {
    const body = await res.json();
    detail = body.detail || detail;
    code = body.code || null;
  } catch (_) { /* response body not JSON */ }

  throw new ApiError(detail, res.status, code);
}

export async function processSession(patientId, dictation, format = 'SOAP') {
  const res = await fetch(`${API_BASE}/sessions/${patientId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_dictation: dictation, format })
  });
  return _handleResponse(res);
}

export async function confirmNote(sessionId, noteData) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edited_note: noteData })
  });
  return _handleResponse(res);
}

export async function getPatientSessions(patientId) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/sessions`);
  const data = await _handleResponse(res);
  return data.items;
}

export async function listPatients() {
  const res = await fetch(`${API_BASE}/patients`);
  return _handleResponse(res);
}

export async function createPatient(name) {
  const res = await fetch(`${API_BASE}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, risk_level: 'low' })
  });
  return _handleResponse(res);
}

export async function listConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  const data = await _handleResponse(res);
  return data.items;
}

export async function archiveSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/archive`, { method: 'PATCH' });
  return _handleResponse(res);
}

export async function archivePatientSessions(patientId) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/sessions/archive`, { method: 'PATCH' });
  return _handleResponse(res);
}

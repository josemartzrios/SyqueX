// auth.js — Gestión de tokens y estado de pantalla
// access_token: en memoria (nunca localStorage)
// refresh_token: httpOnly cookie (el backend lo setea, el JS nunca lo ve)

let _accessToken = null;
let _isRefreshing = false;
let _refreshQueue = []; // callbacks pendientes durante el refresh

export function getAccessToken() {
  return _accessToken;
}

export function setAccessToken(token) {
  _accessToken = token;
}

export function clearAccessToken() {
  _accessToken = null;
}

/**
 * Determina la pantalla inicial basándose en la URL actual.
 * Llama a esto en el mount de App.jsx antes de verificar auth.
 */
export function getScreenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const path = window.location.pathname;

  if (token) return { screen: 'reset-password', resetToken: token };
  if (path === '/registro') return { screen: 'register' };
  if (path === '/forgot-password') return { screen: 'forgot-password' };
  if (path === '/billing') return { screen: 'billing-check' }; // verificar auth primero

  const successParam = params.get('success');
  if (path === '/billing' && successParam === 'true') return { screen: 'billing-success' };

  return { screen: 'loading' }; // intentar refresh silencioso
}

/**
 * Navegar a una "ruta" actualizando la URL sin recargar.
 */
export function navigateTo(path) {
  window.history.pushState({}, '', path);
}

/**
 * Ejecuta un refresh de access token.
 * Si ya hay un refresh en curso, encola la llamada (anti-race-condition).
 * Retorna el nuevo access token o null si falla.
 */
export async function refreshAccessToken(apiBase) {
  if (_isRefreshing) {
    return new Promise((resolve) => {
      _refreshQueue.push(resolve);
    });
  }

  _isRefreshing = true;
  try {
    const res = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // envía la httpOnly cookie
    });

    if (!res.ok) {
      _accessToken = null;
      _refreshQueue.forEach(cb => cb(null));
      _refreshQueue = [];
      return null;
    }

    const data = await res.json();
    _accessToken = data.access_token;
    _refreshQueue.forEach(cb => cb(_accessToken));
    _refreshQueue = [];
    return _accessToken;
  } finally {
    _isRefreshing = false;
  }
}

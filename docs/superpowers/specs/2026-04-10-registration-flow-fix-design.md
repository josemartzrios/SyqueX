# Registration Flow Fix — Design Spec

**Date:** 2026-04-10  
**Status:** Approved  
**Scope:** Bug fix — registration (and login) stuck on loading screen after success

---

## Problem

After a successful registration or login, `onSuccess` sets `authScreen.screen` to `'loading'`.  
The loading screen renders, but `initAuth()` — which transitions the user to `'app'` or `'billing'` — only runs once at mount (`useEffect(..., [])`). It never re-runs. The app stays on the spinner indefinitely.

Root cause: `initAuth` is scoped inside a mount-only `useEffect`, so subsequent `loading` state changes don't trigger it.

---

## Solution — Extract `checkBillingAndRoute`

Extract the billing check + routing logic into a `useCallback` function at the component level. Both `initAuth` (initial load) and `onSuccess` (post-login/register) call this shared function.

After login or registration, the access token is already set in memory — no token refresh needed. `onSuccess` calls `checkBillingAndRoute()` directly, skipping the refresh and going straight to the billing check.

---

## Implementation

### 1. New function in `App.jsx`

```javascript
const checkBillingAndRoute = useCallback(async () => {
  try {
    const status = await getBillingStatus();
    setBillingStatus(status);
    if (status.status === 'trialing' || status.status === 'active') {
      setAuthScreen({ screen: 'app' });
    } else {
      setAuthScreen({ screen: 'billing' });
    }
  } catch {
    setAuthScreen({ screen: 'billing' });
  }
}, []);
```

### 2. Refactor `initAuth` to use it

```javascript
useEffect(() => {
  async function initAuth() {
    if (authScreen.screen === 'reset-password') return;
    const token = await refreshAccessToken(
      (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1'
    );
    if (token) {
      setAccessToken(token);
      await checkBillingAndRoute();
    } else {
      setAuthScreen({ screen: 'login' });
    }
  }
  initAuth();
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

### 3. Update `onSuccess` callbacks

```javascript
// LoginScreen
onSuccess={() => checkBillingAndRoute()}

// RegisterScreen
onSuccess={() => checkBillingAndRoute()}

// ResetPasswordScreen
onSuccess={() => checkBillingAndRoute()}
```

The `loading` screen state becomes unused for post-auth navigation (still used during initial app mount if needed, but `onSuccess` no longer routes through it).

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Add `checkBillingAndRoute`, refactor `initAuth`, update 3 `onSuccess` props |

No changes to `RegisterScreen.jsx`, `LoginScreen.jsx`, `ResetPasswordScreen.jsx`, `auth.js`, or backend.

---

## Out of Scope

- Login screen was affected by the same bug — fix covers it as well
- No change to the initial silent refresh behavior at app mount
- No backend changes

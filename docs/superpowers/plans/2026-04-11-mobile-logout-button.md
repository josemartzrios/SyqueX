# Mobile Logout Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Cerrar sesión" ghost-text button to the bottom of the mobile slide-over drawer (`Sidebar.jsx`) so mobile users can log out.

**Architecture:** Two-file change only. `Sidebar.jsx` gets an `onLogout` prop and renders a divider + button pinned below the session list. `App.jsx` passes the already-existing `handleLogout` function to `<Sidebar>`. No new files, no backend changes.

**Tech Stack:** React 18, Vitest + @testing-library/react, Tailwind CSS (CDN)

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `frontend/src/components/Sidebar.jsx` | Modify | Add `onLogout` to props; add `border-t` divider + button between the closing `</div>` of the session list (line 58) and the closing `</div>` of the panel (line 59) |
| `frontend/src/components/Sidebar.test.jsx` | Modify | Add 3 new tests for the logout button — append to the existing `describe('Sidebar', ...)` block |
| `frontend/src/App.jsx` | Modify | Add `onLogout={handleLogout}` to the `<Sidebar>` JSX at lines 522–528 |

---

## Task 1: Add logout button to Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/Sidebar.test.jsx`

### Step 1.0 — Fix existing test selector (preflight)

The existing test `'click en botón X llama onClose'` in `Sidebar.test.jsx` (line 41) uses `{ name: /cerrar/i }`. Once the "Cerrar sesión" button is added, that regex will match two buttons and the test will break.

Tighten the selector **before** writing new tests:

```jsx
// Before (line 45):
await user.click(screen.getByRole('button', { name: /cerrar/i }))

// After:
await user.click(screen.getByRole('button', { name: /^cerrar$/i }))
```

Run the suite to confirm all 9 still pass:

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx
```

Expected: 9 passing.

### Step 1.1 — Write the failing tests

Append these 3 tests inside the existing `describe('Sidebar', () => { ... })` block in `frontend/src/components/Sidebar.test.jsx`, before the final closing `})`:

```jsx
  it('renderiza el botón "Cerrar sesión"', () => {
    const onLogout = vi.fn()
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} onLogout={onLogout} />)
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
  })

  it('click en "Cerrar sesión" llama onLogout', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} onLogout={onLogout} />)
    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('no explota si onLogout no se pasa — botón sigue renderizando', () => {
    render(<Sidebar open={true} onClose={noop} conversations={[]} onSelectConversation={noop} onDeleteConversation={noop} />)
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
  })
```

### Step 1.2 — Run tests to confirm the 3 new ones fail

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx
```

Expected: 9 existing tests pass, 3 new tests fail (button not found). If Step 1.0 was skipped, the X-button test will also fail — fix Step 1.0 first.

### Step 1.3 — Add the button to Sidebar.jsx

**1. Add `onLogout` to the destructured props** (line 3 of `Sidebar.jsx`):

```jsx
export default function Sidebar({ open, onClose, conversations, onSelectConversation, onDeleteConversation, onLogout }) {
```

**2. Add the logout footer between the closing `</div>` of the session list (line 58) and the closing `</div>` of the panel (line 59):**

```jsx
        {/* Logout — pinned to bottom of drawer */}
        <div className="border-t border-ink/[0.07] flex-shrink-0">
          <button
            onClick={onLogout}
            className="w-full text-left px-5 py-3 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
```

### Step 1.4 — Run tests to confirm all 12 pass

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx
```

Expected: 12 passing, 0 failing.

### Step 1.5 — Commit

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/components/Sidebar.test.jsx
git commit -m "feat(mobile): add Cerrar sesión logout button to slide-over drawer"
```

---

## Task 2: Wire handleLogout in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

### Step 2.1 — Add `onLogout` to the Sidebar JSX

In `frontend/src/App.jsx`, find the `<Sidebar>` block at lines 522–528 and add `onLogout={handleLogout}`:

```jsx
      {/* Mobile slide-over sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onLogout={handleLogout}
      />
```

### Step 2.2 — Manual smoke test

Start the dev server:

```bash
cd frontend && npm run dev
```

On mobile viewport (or browser DevTools at <768px width):

1. Log in with `ana@syquex.demo / demo1234`
2. Tap the hamburger menu (☰) in the top-left to open the drawer
3. Confirm "Cerrar sesión" appears at the bottom of the drawer, below the session list, separated by a thin line
4. Tap "Cerrar sesión" — app should return to the login screen
5. Confirm re-login works normally

### Step 2.3 — Commit

```bash
git add frontend/src/App.jsx
git commit -m "feat(auth): pass handleLogout to mobile Sidebar drawer"
```

---

## Done

The feature is complete when:
- `Sidebar.test.jsx` — 12 tests passing (9 existing + 3 new)
- Smoke test — tapping "Cerrar sesión" in the mobile drawer returns to login screen
- Re-login after logout works

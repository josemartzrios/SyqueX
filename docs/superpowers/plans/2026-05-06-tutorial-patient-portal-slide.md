# Tutorial — Patient Portal Slide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth slide to TutorialModal that introduces the patient portal / session summary sharing feature.

**Architecture:** Single object appended to the `SLIDES_DESKTOP` array in `TutorialModal.jsx`. No new components, no new state, no changes outside this component and its test file. All existing slide logic (progress bar, navigation, PWA mobile slide) works automatically with the longer array.

**Tech Stack:** React 18, Vitest, @testing-library/react

---

## Files Touched

| File | Action |
|------|--------|
| `frontend/src/components/TutorialModal.jsx` | Modify — append one object to `SLIDES_DESKTOP` |
| `frontend/src/components/TutorialModal.test.jsx` | Modify — update slide-count assertions + add new slide test |

---

## Task 1: Update Tests (Write Failing Tests First)

**Files:**
- Modify: `frontend/src/components/TutorialModal.test.jsx`

- [ ] **Step 1: Update the "1 de 4" and "2 de 4" counter assertions**

In `TutorialModal.test.jsx`, find and update these two lines:

```jsx
// Line ~27 — was: expect(screen.getByText('1 de 4')).toBeInTheDocument()
expect(screen.getByText('1 de 5')).toBeInTheDocument()

// Line ~33 — was: expect(screen.getByText('2 de 4')).toBeInTheDocument()
expect(screen.getByText('2 de 5')).toBeInTheDocument()
```

- [ ] **Step 2: Update "Finalizar on last desktop slide" test (was slide 4, now slide 5)**

Replace the test at line ~48:

```jsx
it('shows "Finalizar" instead of "Siguiente" on last slide (desktop = slide 5)', () => {
  render(<TutorialModal {...defaultProps} isMobile={false} />)
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  expect(screen.getByText('Finalizar')).toBeInTheDocument()
  expect(screen.queryByText('Siguiente →')).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Update "closes on Finalizar" test (add one extra click)**

Replace the test at line ~65:

```jsx
it('closes and sets syquex_tutorial_done when "Finalizar" is clicked', () => {
  render(<TutorialModal {...defaultProps} isMobile={false} />)
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Finalizar'))
  expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('syquex_tutorial_done')).toBe('true')
})
```

- [ ] **Step 4: Replace the "desktop: does NOT render slide 5" test with a positive assertion**

Replace the test at line ~90:

```jsx
it('desktop: renders 5 slides, slide 5 is patient portal', () => {
  render(<TutorialModal {...defaultProps} isMobile={false} />)
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  expect(screen.getByText(/Comparte el seguimiento/i)).toBeInTheDocument()
  expect(screen.getByText('Finalizar')).toBeInTheDocument()
  expect(screen.getByText('5 de 5')).toBeInTheDocument()
})
```

- [ ] **Step 5: Add the new slide content test (desktop, slide 5)**

Add this test after the one you just replaced (after the block ending with `'5 de 5'`):

```jsx
it('renders slide 5 — patient portal sharing', () => {
  render(<TutorialModal {...defaultProps} isMobile={false} />)
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  fireEvent.click(screen.getByText('Siguiente →'))
  expect(screen.getByText(/Comparte el seguimiento con tu paciente/i)).toBeInTheDocument()
  expect(screen.getByText(/Después de confirmar la nota/i)).toBeInTheDocument()
  expect(screen.getByText('5 de 5')).toBeInTheDocument()
})
```

- [ ] **Step 6: Update all mobile PWA tests — add one extra click each**

The mobile PWA slide is now reached with **5 clicks** instead of 4. Update every test inside `describe('slide 5 — PWA install (mobile only)', ...)` that navigates to the PWA slide. Also update the counter from `'5 de 5'` to `'6 de 6'`. Replace the entire describe block:

```jsx
describe('slide 6 — PWA install (mobile only)', () => {
  it('mobile: renders slide 6 after slide 5', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Instala la app/i)).toBeInTheDocument()
    expect(screen.getByText('6 de 6')).toBeInTheDocument()
  })

  it('mobile: "Finalizar" appears on slide 6', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Finalizar')).toBeInTheDocument()
  })

  it('renders Safari instructions when browser is safari', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="safari" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Compartir/i)).toBeInTheDocument()
    expect(screen.getByText(/Agregar a inicio/i)).toBeInTheDocument()
  })

  it('renders Chrome install button when browser is chrome and isInstallable', () => {
    render(
      <TutorialModal
        {...defaultProps}
        isMobile={true}
        forceBrowser="chrome"
        forceInstallable={true}
        onTriggerInstall={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText('Instalar app')).toBeInTheDocument()
  })

  it('renders fallback when browser is "other"', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="other" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(screen.getByText(/Safari/i)).toBeInTheDocument()
    expect(screen.getByText(/Chrome/i)).toBeInTheDocument()
  })

  it('"Ya la instalé ✓" closes and sets tutorial_done', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="safari" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Ya la instalé ✓'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('syquex_tutorial_done')).toBe('true')
  })

  it('sets syquex_pwa_prompted when PWA slide mounts', () => {
    render(<TutorialModal {...defaultProps} isMobile={true} forceBrowser="safari" />)
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    fireEvent.click(screen.getByText('Siguiente →'))
    expect(localStorage.getItem('syquex_pwa_prompted')).toBe('true')
  })
})
```

- [ ] **Step 7: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/components/TutorialModal.test.jsx
```

Expected: multiple failures referencing slide count mismatches (`1 de 4`, `4 de 4`, `5 de 5`, etc.) and the new slide content not found.

---

## Task 2: Add the New Slide to TutorialModal.jsx

**Files:**
- Modify: `frontend/src/components/TutorialModal.jsx`

- [ ] **Step 1: Append the new slide object to SLIDES_DESKTOP**

In `TutorialModal.jsx`, find `SLIDES_DESKTOP` (line 4). Add the new object as the 5th element, before the closing `]`:

```js
const SLIDES_DESKTOP = [
  {
    icon: '👋',
    title: 'Bienvenido a SyqueX',
    body: 'Tu flujo de trabajo: Agrega un paciente → Escribe tus apuntes → El asistente genera la nota → Confirma y guarda.',
    flow: true,
  },
  {
    icon: '👤',
    title: 'Crea tu primer paciente',
    body: 'Haz clic en el botón +Nuevo junto a "Pacientes" en el sidebar. Cada paciente tiene su propio historial de sesiones y notas clínicas.',
  },
  {
    icon: '✏️',
    title: 'Escribe tus apuntes',
    body: 'Escribe libremente en el panel de dictado — sin estructura. El asistente organiza automáticamente tu nota clínica.',
  },
  {
    icon: '📄',
    title: 'Revisa y confirma la nota',
    body: 'La nota generada aparece a la derecha. Edita cualquier campo directo en la nota antes de confirmar. Queda guardada en el expediente.',
  },
  {
    icon: '📨',
    title: 'Comparte el seguimiento con tu paciente',
    body: 'Después de confirmar la nota, genera un resumen en lenguaje simple. Lo revisas, lo editas y lo envías — el paciente lo ve en su propio portal.',
  },
]
```

- [ ] **Step 2: Run tests — verify they all pass**

```bash
cd frontend && npx vitest run src/components/TutorialModal.test.jsx
```

Expected output: all tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TutorialModal.jsx frontend/src/components/TutorialModal.test.jsx
git commit -m "feat: add patient portal slide to tutorial"
```

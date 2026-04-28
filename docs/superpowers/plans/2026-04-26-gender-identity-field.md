# Gender Identity + Phone Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two optional fields to the patient intake form:
- `gender_identity` (select: hombre/mujer/no_binario/otro) — persisted encrypted in DB, exposed via API.
- `phone` (string, min 10 / max 20 chars) — teléfono del paciente para contacto directo; persisted encrypted (sensibilidad contextual LFPDPPP Art. 3-VI — su asociación con un sistema de salud mental lo convierte en vector de revelación indirecta de dato sensible).

**Architecture:** Three-layer change — DB migration + SQLAlchemy model, then backend API schemas + encrypt/decrypt handlers, then frontend form. Each layer is independently committable. DB migrations are idempotent (`ADD COLUMN IF NOT EXISTS`). Both fields pass through the same `encrypt_if_set` / `decrypt_if_set` pipeline as `reason_for_consultation` and `address`. `gender_identity` additionally has a `DO $$` CHECK constraint; `phone` does not (format validation lives in Pydantic).

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy 2.0 async / PostgreSQL 16 — React 18 / Vitest / @testing-library/react / userEvent

---

## File Map

| File | Change |
|------|--------|
| `backend/database.py` | Add `gender_identity` + `phone` columns to `Patient` model + migration statements in `init_db()` |
| `backend/api/routes.py` | Add `GenderIdentity` Literal type, both fields to `PatientCreate` / `PatientUpdate` / `PatientOut`, encrypt in `create_patient`, add to `_PATIENT_SENSITIVE` in `update_patient`, add to `_decrypt_patient_orm` loop |
| `backend/tests/test_patient_create.py` | Add 6 tests: 3 for `gender_identity`, 3 for `phone` |
| `backend/tests/test_patient_update.py` | Add 2 tests: PATCH with `gender_identity`, PATCH with `phone` |
| `frontend/src/components/PatientIntakeModal.jsx` | Add `GENDER_OPTIONS`, update `EMPTY_FORM` / `toForm` / `buildPayload`, add gender select + phone input, add `phoneInvalid` validation |
| `frontend/src/components/PatientIntakeModal.test.jsx` | Add 6 tests: 3 for gender select, 3 for phone input |

---

## Task 1 — SQLAlchemy model + DB migration

**Files:**
- Modify: `backend/database.py:199-206` (Patient class fields)
- Modify: `backend/database.py:416-424` (init_db ADD COLUMN block)
- Modify: `backend/database.py:480-490` (init_db CHECK constraint block)

> No unit test for this task — the migration is exercised by Task 2's API tests.

- [ ] **Step 1: Add columns to Patient SQLAlchemy model**

In `backend/database.py`, in the `Patient` class after `psychological_history` (line ~206), add:

```python
    psychological_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gender_identity: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
```

- [ ] **Step 2: Add ADD COLUMN migrations**

In `backend/database.py`, inside `init_db()`, after the block that adds patient intake columns (after `psychological_history`, around line ~423), add:

```python
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender_identity VARCHAR(30);"))
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone VARCHAR(20);"))
```

- [ ] **Step 3: Add CHECK constraint migration for gender_identity**

In `backend/database.py`, inside `init_db()`, after the `chk_patients_risk_level` block (around line ~490), add:

```python
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_gender_identity'
                ) THEN
                    ALTER TABLE patients ADD CONSTRAINT chk_patients_gender_identity
                        CHECK (gender_identity IN ('hombre', 'mujer', 'no_binario', 'otro'));
                END IF;
            END$$;
        """))
```

> `phone` no necesita CHECK constraint — la validación de longitud vive en Pydantic.

- [ ] **Step 4: Commit**

```bash
git add backend/database.py
git commit -m "feat: add gender_identity and phone columns to patients table"
```

---

## Task 2 — Backend API: schemas, encrypt/decrypt, handlers + tests

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/tests/test_patient_create.py`
- Modify: `backend/tests/test_patient_update.py`

- [ ] **Step 1: Write failing tests for gender_identity in test_patient_create.py**

Add at the bottom of `backend/tests/test_patient_create.py`:

```python
@pytest.mark.asyncio
async def test_gender_identity_valid_value(authed_app, mock_db):
    """gender_identity='mujer' persists and is returned decrypted in response."""
    pid = uuid.uuid4()
    captured = {}

    def capture_add(obj):
        if type(obj).__name__ == "Patient":
            obj.id = pid
            captured["patient"] = obj

    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "gender_identity": "mujer",
            },
        )

    assert res.status_code == 201
    assert res.json()["gender_identity"] == "mujer"


@pytest.mark.asyncio
async def test_gender_identity_invalid_value_returns_422(authed_app):
    """Valores fuera del Literal -> 422."""
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "gender_identity": "masculino",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_gender_identity_omitted_returns_201(authed_app, mock_db):
    """Campo opcional — omitirlo no impide la creación."""
    pid = uuid.uuid4()
    mock_db.add.side_effect = lambda obj: setattr(obj, "id", pid) if type(obj).__name__ == "Patient" else None

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
            },
        )
    assert res.status_code == 201
    assert res.json().get("gender_identity") is None
```

- [ ] **Step 2: Write failing tests for phone in test_patient_create.py**

Append to `backend/tests/test_patient_create.py`:

```python
@pytest.mark.asyncio
async def test_phone_valid_value(authed_app, mock_db):
    """phone de 10 dígitos persiste y se retorna descifrado en la respuesta."""
    pid = uuid.uuid4()
    captured = {}

    def capture_add(obj):
        if type(obj).__name__ == "Patient":
            obj.id = pid
            captured["patient"] = obj

    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "phone": "5512345678",
            },
        )

    assert res.status_code == 201
    assert res.json()["phone"] == "5512345678"


@pytest.mark.asyncio
async def test_phone_too_short_returns_422(authed_app):
    """phone con menos de 10 caracteres -> 422."""
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "phone": "123456",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_phone_omitted_returns_201(authed_app, mock_db):
    """Campo opcional — omitirlo no impide la creación."""
    pid = uuid.uuid4()
    mock_db.add.side_effect = lambda obj: setattr(obj, "id", pid) if type(obj).__name__ == "Patient" else None

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
            },
        )
    assert res.status_code == 201
    assert res.json().get("phone") is None
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd backend && python -m pytest tests/test_patient_create.py::test_gender_identity_valid_value tests/test_patient_create.py::test_gender_identity_invalid_value_returns_422 tests/test_patient_create.py::test_gender_identity_omitted_returns_201 tests/test_patient_create.py::test_phone_valid_value tests/test_patient_create.py::test_phone_too_short_returns_422 tests/test_patient_create.py::test_phone_omitted_returns_201 -v
```

Expected: los tests `_valid_value` y `_invalid_value`/`_too_short` FALLAN. Los `_omitted` pueden pasar ya.

- [ ] **Step 4: Add GenderIdentity Literal type**

In `backend/api/routes.py`, after `MaritalStatus` (around line ~115):

```python
MaritalStatus = Literal[
    "soltero", "casado", "divorciado", "viudo", "union_libre", "otro"
]

GenderIdentity = Literal["hombre", "mujer", "no_binario", "otro"]
```

- [ ] **Step 5: Add fields to PatientCreate**

In `PatientCreate` (around line ~131), after `marital_status`:

```python
    marital_status: Optional[MaritalStatus] = None
    gender_identity: Optional[GenderIdentity] = None
    phone: Optional[str] = Field(None, min_length=10, max_length=20)
    occupation: Optional[str] = Field(None, max_length=120)
```

- [ ] **Step 6: Add fields to PatientUpdate**

In `PatientUpdate` (around line ~306), after `marital_status`:

```python
    marital_status: Optional[MaritalStatus] = None
    gender_identity: Optional[GenderIdentity] = None
    phone: Optional[str] = Field(None, min_length=10, max_length=20)
    occupation: Optional[str] = Field(None, max_length=120)
```

- [ ] **Step 7: Add fields to PatientOut**

In `PatientOut` (around line ~346), after `marital_status`:

```python
    marital_status: Optional[str] = None
    gender_identity: Optional[str] = None
    phone: Optional[str] = None
    occupation: Optional[str] = None
```

- [ ] **Step 8: Add both fields to _decrypt_patient_orm**

In `_decrypt_patient_orm` (around line ~75), add `"gender_identity"` y `"phone"` al loop:

```python
def _decrypt_patient_orm(patient) -> None:
    """Descifra in-place los campos sensibles de un ORM Patient antes de serializar."""
    for field in ["medical_history", "psychological_history", "reason_for_consultation", "address", "gender_identity", "phone"]:
        setattr(patient, field, decrypt_if_set(getattr(patient, field, None)))
```

- [ ] **Step 9: Encrypt both on create_patient**

In the `create_patient` handler, in the `Patient(...)` constructor call, after `psychological_history`:

```python
        medical_history=encrypt_if_set(payload.medical_history),
        psychological_history=encrypt_if_set(payload.psychological_history),
        gender_identity=encrypt_if_set(payload.gender_identity),
        phone=encrypt_if_set(payload.phone),
```

- [ ] **Step 10: Encrypt both on update_patient**

In `update_patient`, update `_PATIENT_SENSITIVE` (around line ~537):

```python
    _PATIENT_SENSITIVE = {"medical_history", "psychological_history", "reason_for_consultation", "address", "gender_identity", "phone"}
```

- [ ] **Step 11: Run create tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_patient_create.py -v
```

Expected: all tests PASS.

- [ ] **Step 12: Write failing tests for update**

Add at the bottom of `backend/tests/test_patient_update.py`:

```python
@pytest.mark.asyncio
async def test_patch_gender_identity(authed_app, mock_db, fake_psychologist):
    """PATCH gender_identity actualiza el campo y lo retorna descifrado."""
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid, gender_identity=None)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"gender_identity": "no_binario"},
        )

    assert res.status_code == 200
    assert res.json()["gender_identity"] == "no_binario"


@pytest.mark.asyncio
async def test_patch_phone(authed_app, mock_db, fake_psychologist):
    """PATCH phone actualiza el campo y lo retorna descifrado."""
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid, phone=None)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"phone": "5512345678"},
        )

    assert res.status_code == 200
    assert res.json()["phone"] == "5512345678"
```

- [ ] **Step 13: Run update tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_patient_update.py::test_patch_gender_identity tests/test_patient_update.py::test_patch_phone -v
```

Expected: PASS (los campos ya están en `_PATIENT_SENSITIVE` desde Step 10).

- [ ] **Step 14: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: all tests PASS, no regressions.

- [ ] **Step 15: Commit**

```bash
git add backend/api/routes.py backend/tests/test_patient_create.py backend/tests/test_patient_update.py
git commit -m "feat: gender_identity and phone fields in patient API — schema, encrypt/decrypt, tests"
```

---

## Task 3 — Frontend: PatientIntakeModal form + tests

**Files:**
- Modify: `frontend/src/components/PatientIntakeModal.jsx`
- Modify: `frontend/src/components/PatientIntakeModal.test.jsx`

- [ ] **Step 1: Write failing frontend tests for gender_identity**

Add at the bottom of `frontend/src/components/PatientIntakeModal.test.jsx`:

```jsx
  it('renderiza el select de identidad de género con valor vacío por defecto', () => {
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    const select = screen.getByLabelText(/Identidad de género/)
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('')
  })

  it('submit sin gender_identity no incluye el campo en el payload', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    createPatient.mockResolvedValueOnce({ id: 1, name: 'Ana' })

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1))
    const payload = createPatient.mock.calls[0][0]
    expect(payload).not.toHaveProperty('gender_identity')
  })

  it('submit con gender_identity="mujer" incluye el valor en el payload', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    createPatient.mockResolvedValueOnce({ id: 1, name: 'Ana' })

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.selectOptions(screen.getByLabelText(/Identidad de género/), 'mujer')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1))
    const payload = createPatient.mock.calls[0][0]
    expect(payload.gender_identity).toBe('mujer')
  })
```

- [ ] **Step 2: Write failing frontend tests for phone**

Append to `frontend/src/components/PatientIntakeModal.test.jsx`:

```jsx
  it('renderiza el input de teléfono con valor vacío por defecto', () => {
    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    const input = screen.getByLabelText(/Teléfono del paciente/)
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('')
  })

  it('submit sin phone no incluye el campo en el payload', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    createPatient.mockResolvedValueOnce({ id: 1, name: 'Ana' })

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1))
    const payload = createPatient.mock.calls[0][0]
    expect(payload).not.toHaveProperty('phone')
  })

  it('submit con phone válido incluye el valor en el payload', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    createPatient.mockResolvedValueOnce({ id: 1, name: 'Ana' })

    render(<PatientIntakeModal open={true} mode="create" onClose={noop} onSaved={noop} />)
    await user.type(screen.getByPlaceholderText(/María García/), 'Ana')
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-01-01')
    await user.type(screen.getByPlaceholderText(/Qué trae al paciente/), 'Ansiedad')
    await user.type(screen.getByLabelText(/Teléfono del paciente/), '5512345678')
    await user.click(screen.getByRole('button', { name: /Crear paciente/i }))

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1))
    const payload = createPatient.mock.calls[0][0]
    expect(payload.phone).toBe('5512345678')
  })
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/components/PatientIntakeModal.test.jsx
```

Expected: los 6 tests nuevos FALLAN.

- [ ] **Step 4: Add GENDER_OPTIONS constant**

In `frontend/src/components/PatientIntakeModal.jsx`, after `MARITAL_OPTIONS`:

```js
const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'hombre', label: 'Hombre' },
  { value: 'mujer', label: 'Mujer' },
  { value: 'no_binario', label: 'No binario' },
  { value: 'otro', label: 'Otro' },
];
```

- [ ] **Step 5: Update EMPTY_FORM**

```js
const EMPTY_FORM = {
  name: '',
  date_of_birth: '',
  reason_for_consultation: '',
  marital_status: '',
  gender_identity: '',
  phone: '',
  occupation: '',
  address: '',
  ec_name: '',
  ec_relationship: '',
  ec_phone: '',
  medical_history: '',
  psychological_history: '',
};
```

- [ ] **Step 6: Update toForm**

In `toForm`, after `marital_status`:

```js
    marital_status: patient.marital_status || '',
    gender_identity: patient.gender_identity || '',
    phone: patient.phone || '',
    occupation: patient.occupation || '',
```

- [ ] **Step 7: Update buildPayload**

```js
  const base = {
    name: form.name.trim(),
    date_of_birth: form.date_of_birth || null,
    reason_for_consultation: form.reason_for_consultation.trim(),
    marital_status: form.marital_status || null,
    gender_identity: form.gender_identity || null,
    phone: form.phone.trim() || null,
    occupation: form.occupation.trim() || null,
    address: form.address.trim() || null,
    emergency_contact,
    medical_history: form.medical_history.trim() || null,
    psychological_history: form.psychological_history.trim() || null,
  };
```

- [ ] **Step 8: Add phoneInvalid validation**

After `const ageInvalid = ...` (around line ~113), add:

```js
  const phoneInvalid = form.phone.trim().length > 0 && form.phone.trim().length < 10;
```

Update `canSubmit` to include `&& !phoneInvalid`.

- [ ] **Step 9: Add phone input and gender select to JSX**

**9a — Phone input:** In the IDENTIDAD section, right after the `<Field label="Nombre completo">` block (after line ~221), add:

```jsx
            <Field
              label="Teléfono"
              error={phoneInvalid ? 'Mínimo 10 dígitos' : null}
            >
              <input
                type="tel"
                value={form.phone}
                onChange={setField('phone')}
                maxLength={20}
                disabled={saving || loading}
                placeholder="Ej. 55 1234 5678"
                className={inputClass}
                aria-label="Teléfono del paciente"
              />
            </Field>
```

**9b — Gender select:** In the IDENTIDAD section, after `<Field label="Ocupación">` (after line ~261), add:

```jsx
            <Field label="Identidad de género">
              <select
                value={form.gender_identity}
                onChange={setField('gender_identity')}
                disabled={saving || loading}
                className={inputClass}
                aria-label="Identidad de género"
              >
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
```

> El `aria-label` explícito en el `<select>` garantiza que `getByLabelText(/Identidad de género/)` funcione en los tests independientemente de cómo el componente `Field` componga el texto del `<label>`.

- [ ] **Step 10: Run frontend tests — verify they pass**

```bash
cd frontend && npx vitest run src/components/PatientIntakeModal.test.jsx
```

Expected: all tests PASS, including the 6 new ones.

- [ ] **Step 11: Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS, no regressions.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/PatientIntakeModal.jsx frontend/src/components/PatientIntakeModal.test.jsx
git commit -m "feat: gender identity select and phone field in patient intake form"
```

---

## Done

After Task 3 the feature is complete. Verify end-to-end manually:
1. Start backend + frontend locally (`.\start-backend.ps1` / `.\start-frontend.ps1`)
2. Open the app, click "Nuevo paciente"
3. Confirma que el campo Teléfono aparece en la sección Identidad (debajo del nombre)
4. Confirma que el select de Identidad de género aparece después de Ocupación
5. Crea un paciente con teléfono "5512345678" y género "No binario" → edita el paciente → confirma que ambos valores persisten
6. Intenta escribir un teléfono de 6 dígitos → confirma que el botón se deshabilita y aparece el error "Mínimo 10 dígitos"

# Gender Identity Field — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `gender_identity` field (select: hombre/mujer/no_binario/otro) to the patient intake form, persisted encrypted in the DB and exposed via API.

**Architecture:** Three-layer change — DB migration + SQLAlchemy model, then backend API schemas + encrypt/decrypt handlers, then frontend form. Each layer is independently committable. The DB migration is idempotent (`ADD COLUMN IF NOT EXISTS` + `DO $$` CHECK constraint). The field is treated as sensitive data (LFPDPPP Art. 3-VI) and passes through the same `encrypt_if_set` / `decrypt_if_set` pipeline as `reason_for_consultation` and `address`.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy 2.0 async / PostgreSQL 16 — React 18 / Vitest / @testing-library/react / userEvent

---

## File Map

| File | Change |
|------|--------|
| `backend/database.py` | Add `gender_identity` column to `Patient` model + two migration statements in `init_db()` |
| `backend/api/routes.py` | Add `GenderIdentity` Literal type, field to `PatientCreate` / `PatientUpdate` / `PatientOut`, encrypt in `create_patient`, add to `_PATIENT_SENSITIVE` in `update_patient`, add to `_decrypt_patient_orm` loop |
| `backend/tests/test_patient_create.py` | Add 3 tests: valid value, invalid value → 422, omitted → 201 |
| `backend/tests/test_patient_update.py` | Add 1 test: PATCH with `gender_identity` |
| `frontend/src/components/PatientIntakeModal.jsx` | Add `GENDER_OPTIONS`, update `EMPTY_FORM` / `toForm` / `buildPayload`, add select between Estado civil and Ocupación |
| `frontend/src/components/PatientIntakeModal.test.jsx` | Add 3 tests: select renders, submit without field, submit with value |

---

## Task 1 — SQLAlchemy model + DB migration

**Files:**
- Modify: `backend/database.py:199-206` (Patient class fields)
- Modify: `backend/database.py:416-424` (init_db ADD COLUMN block)
- Modify: `backend/database.py:480-490` (init_db CHECK constraint block)

> No unit test for this task — the migration is exercised by Task 2's API tests.

- [ ] **Step 1: Add column to Patient SQLAlchemy model**

In `backend/database.py`, in the `Patient` class after `psychological_history` (line ~206), add:

```python
    psychological_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gender_identity: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
```

- [ ] **Step 2: Add ADD COLUMN migration**

In `backend/database.py`, inside `init_db()`, after the block that adds patient intake columns (after `psychological_history`, around line ~423), add:

```python
        await conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender_identity VARCHAR(30);"))
```

- [ ] **Step 3: Add CHECK constraint migration**

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

- [ ] **Step 4: Commit**

```bash
git add backend/database.py
git commit -m "feat: add gender_identity column to patients table"
```

---

## Task 2 — Backend API: schemas, encrypt/decrypt, handlers + tests

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/tests/test_patient_create.py`
- Modify: `backend/tests/test_patient_update.py`

- [ ] **Step 1: Write failing tests in test_patient_create.py**

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

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && python -m pytest tests/test_patient_create.py::test_gender_identity_valid_value tests/test_patient_create.py::test_gender_identity_invalid_value_returns_422 tests/test_patient_create.py::test_gender_identity_omitted_returns_201 -v
```

Expected: at least `test_gender_identity_valid_value` and `test_gender_identity_invalid_value_returns_422` FAIL.

- [ ] **Step 3: Add GenderIdentity Literal type**

In `backend/api/routes.py`, after `MaritalStatus` (around line ~115):

```python
MaritalStatus = Literal[
    "soltero", "casado", "divorciado", "viudo", "union_libre", "otro"
]

GenderIdentity = Literal["hombre", "mujer", "no_binario", "otro"]
```

- [ ] **Step 4: Add field to PatientCreate**

In `PatientCreate` (around line ~131), after `marital_status`:

```python
    marital_status: Optional[MaritalStatus] = None
    gender_identity: Optional[GenderIdentity] = None
    occupation: Optional[str] = Field(None, max_length=120)
```

- [ ] **Step 5: Add field to PatientUpdate**

In `PatientUpdate` (around line ~306), after `marital_status`:

```python
    marital_status: Optional[MaritalStatus] = None
    gender_identity: Optional[GenderIdentity] = None
    occupation: Optional[str] = Field(None, max_length=120)
```

- [ ] **Step 6: Add field to PatientOut**

In `PatientOut` (around line ~346), after `marital_status`:

```python
    marital_status: Optional[str] = None
    gender_identity: Optional[str] = None
    occupation: Optional[str] = None
```

- [ ] **Step 7: Encrypt on create**

In `_decrypt_patient_orm` (around line ~75), add `"gender_identity"` to the loop list:

```python
def _decrypt_patient_orm(patient) -> None:
    """Descifra in-place los campos sensibles de un ORM Patient antes de serializar."""
    for field in ["medical_history", "psychological_history", "reason_for_consultation", "address", "gender_identity"]:
        setattr(patient, field, decrypt_if_set(getattr(patient, field, None)))
```

- [ ] **Step 8: Encrypt on create_patient**

In the `create_patient` handler, in the `Patient(...)` constructor call, after `psychological_history`:

```python
        medical_history=encrypt_if_set(payload.medical_history),
        psychological_history=encrypt_if_set(payload.psychological_history),
        gender_identity=encrypt_if_set(payload.gender_identity),
```

- [ ] **Step 9: Encrypt on update_patient**

In `update_patient`, update `_PATIENT_SENSITIVE` (around line ~537) to include `"gender_identity"`:

```python
    _PATIENT_SENSITIVE = {"medical_history", "psychological_history", "reason_for_consultation", "address", "gender_identity"}
```

- [ ] **Step 10: Run create tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_patient_create.py -v
```

Expected: all tests PASS.

- [ ] **Step 11: Write failing test for update**

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
```

- [ ] **Step 12: Run update test — verify it fails, then passes**

```bash
cd backend && python -m pytest tests/test_patient_update.py::test_patch_gender_identity -v
```

Expected before: FAIL. After Step 9 is done it should already pass — confirm PASS.

- [ ] **Step 13: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: all tests PASS, no regressions.

- [ ] **Step 14: Commit**

```bash
git add backend/api/routes.py backend/tests/test_patient_create.py backend/tests/test_patient_update.py
git commit -m "feat: gender_identity field in patient API — schema, encrypt/decrypt, tests"
```

---

## Task 3 — Frontend: PatientIntakeModal form + tests

**Files:**
- Modify: `frontend/src/components/PatientIntakeModal.jsx`
- Modify: `frontend/src/components/PatientIntakeModal.test.jsx`

- [ ] **Step 1: Write failing frontend tests**

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

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/components/PatientIntakeModal.test.jsx
```

Expected: the 3 new tests FAIL (select doesn't exist yet).

- [ ] **Step 3: Add GENDER_OPTIONS constant**

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

- [ ] **Step 4: Update EMPTY_FORM**

Add `gender_identity` to `EMPTY_FORM`:

```js
const EMPTY_FORM = {
  name: '',
  date_of_birth: '',
  reason_for_consultation: '',
  marital_status: '',
  gender_identity: '',
  occupation: '',
  address: '',
  ec_name: '',
  ec_relationship: '',
  ec_phone: '',
  medical_history: '',
  psychological_history: '',
};
```

- [ ] **Step 5: Update toForm**

In `toForm`, after `marital_status`:

```js
    marital_status: patient.marital_status || '',
    gender_identity: patient.gender_identity || '',
    occupation: patient.occupation || '',
```

- [ ] **Step 6: Update buildPayload**

In `buildPayload`, add `gender_identity` to `base`:

```js
  const base = {
    name: form.name.trim(),
    date_of_birth: form.date_of_birth || null,
    reason_for_consultation: form.reason_for_consultation.trim(),
    marital_status: form.marital_status || null,
    gender_identity: form.gender_identity || null,
    occupation: form.occupation.trim() || null,
    address: form.address.trim() || null,
    emergency_contact,
    medical_history: form.medical_history.trim() || null,
    psychological_history: form.psychological_history.trim() || null,
  };
```

- [ ] **Step 7: Add select to JSX**

In `PatientIntakeModal.jsx`, inside the IDENTIDAD section, between the `grid grid-cols-1 sm:grid-cols-2` div (that holds Fecha de nacimiento + Estado civil) and the `<Field label="Ocupación">`, add:

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

> Note: The `Field` component wraps children in a `<label>`. The explicit `aria-label` on the `<select>` ensures `getByLabelText(/Identidad de género/)` works reliably in tests regardless of how the `<label>` text is computed.

- [ ] **Step 8: Run frontend tests — verify they pass**

```bash
cd frontend && npx vitest run src/components/PatientIntakeModal.test.jsx
```

Expected: all tests PASS, including the 3 new ones.

- [ ] **Step 9: Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS, no regressions.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/PatientIntakeModal.jsx frontend/src/components/PatientIntakeModal.test.jsx
git commit -m "feat: gender identity select in patient intake form"
```

---

## Done

After Task 3 the feature is complete. Verify end-to-end manually:
1. Start backend + frontend locally (`.\start-backend.ps1` / `.\start-frontend.ps1`)
2. Open the app, click "Nuevo paciente"
3. Confirm the select appears between Estado civil y Ocupación on both mobile and desktop
4. Create a patient with "No binario" → edit the patient → confirm the value persists

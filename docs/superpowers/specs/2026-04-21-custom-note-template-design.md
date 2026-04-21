# Custom Note Template — Design Spec

**Date:** 2026-04-21  
**Status:** Approved  
**Branch target:** `dev`

---

## Overview

Psychologists document sessions in highly personal ways. SyqueX currently forces everyone into SOAP/DAP/BIRP formats. This feature lets each psychologist define their own note structure once — the AI agent then fills it automatically on every future session from the dictation.

One template per psychologist. Rich field types (text, scale, checkbox, list, date). Zero friction from day one.

---

## Template Creation — Two Paths

### Entry Point

A modal appears the first time a psychologist tries to confirm a session without a template configured. It also surfaces from Settings at any time.

The modal presents two options with clear hierarchy:

**Primary (Recommended):** "Subir una nota que ya uso" — upload a PDF of an existing note. The agent extracts the structure automatically.

**Secondary:** "No tengo notas en PDF — diseñar desde cero" — step-by-step wizard to define fields manually.

A tertiary escape link: "Usar formato SOAP por ahora — configurar después" keeps the current flow intact for users who skip setup.

### Path A — Wizard (no existing PDF)

A step-by-step form. For each field the psychologist defines:
- **Label** — name of the section (e.g., "Estado emocional")
- **Type** — text | scale 1–10 | checkbox | list | date
- **Options** — required for `checkbox` and `list` types; each option is a string (e.g., "Llanto durante sesión", "Ideación suicida reportada"). `checkbox` renders all options as independently toggleable items; `list` renders as single-select.
- **Guiding question** — optional hint telling the agent what to look for in the dictation (e.g., "¿Qué emociones reporta el paciente esta sesión?")

Fields can be added, reordered, and deleted. The wizard saves the template on final step.

### Path B — PDF Upload (primary)

1. Psychologist uploads a PDF of an existing note (max 5 MB).
2. Backend sends the PDF content to Claude with a prompt to extract sections, infer field types, and propose guiding questions.
3. The extracted template is presented as an editable list of fields for review.
4. Psychologist adjusts (rename, change type, add/remove) and saves.

**Privacy note displayed in UI:** "El agente solo aprende la estructura, no guarda el contenido de la nota."

**Error state:** If Claude cannot extract a usable structure (scanned image with no machine-readable text, or file is not a clinical note), the endpoint returns a 422 with a user-facing message: "No pudimos detectar secciones — revisa que el PDF tenga texto seleccionable." The psychologist is returned to the upload screen.

Both paths converge to the same JSON template stored in the database.

---

## Data Model

### New table: `note_templates`

```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
psychologist_id  UUID NOT NULL REFERENCES psychologists(id) ON DELETE CASCADE
fields           JSONB NOT NULL DEFAULT '[]'
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
UNIQUE (psychologist_id)
```

Each element in `fields`:

```json
{
  "id": "uuid-v4",
  "label": "Estado afectivo",
  "type": "text | scale | checkbox | list | date",
  "options": ["Opción A", "Opción B"],
  "guiding_question": "¿Qué emociones reporta el paciente esta sesión?",
  "order": 1
}
```

### Modified table: `clinical_notes`

Add column:

```sql
custom_fields  JSONB
```

`custom_fields` stores filled values keyed by field `id`:

```json
{
  "uuid-field-1": "La paciente reporta mejoría...",
  "uuid-field-2": 7,
  "uuid-field-3": ["Llanto durante sesión", "Cumplió tareas entre sesiones"],
  "uuid-field-4": "Respiración diafragmática",
  "uuid-field-5": "2026-04-21"
}
```

Existing `subjective`, `objective`, `assessment`, `plan` columns are preserved for SOAP legacy notes. Notes with `custom_fields` populated use the custom template path; notes without it use the legacy SOAP path.

---

## API Endpoints

### Template management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/template` | Get current psychologist's template |
| `POST` | `/template` | Create or replace template |
| `POST` | `/template/analyze-pdf` | Analyze PDF → return proposed fields |

`POST /template/analyze-pdf` accepts `multipart/form-data` with a PDF file. Returns a list of proposed field objects (same schema as `fields` array). The psychologist reviews and edits before calling `POST /template` to save.

### Session processing — unchanged signature

`POST /sessions/{patient_id}/process` and `POST /sessions/{session_id}/confirm` keep their existing signatures. The backend loads the template internally when one exists.

---

## Agent Architecture — tool_use

When a psychologist has a template, the session processing call builds a Claude `tool_use` definition from the template fields:

JSON type mapping per field type:

| Field type | JSON Schema type | Constraints |
|------------|-----------------|-------------|
| `text` | `string` | — |
| `scale` | `integer` | `minimum: 1, maximum: 10` |
| `checkbox` | `array` of `string` | `items: {type: string, enum: field.options}` — agent returns the subset of options it marks as observed |
| `list` | `string` | `enum: field.options` — agent returns exactly one option |
| `date` | `string` | `format: date` (ISO 8601 YYYY-MM-DD) |

```python
tool = {
    "name": "fill_custom_note",
    "description": "Fill all fields of the psychologist's custom note from the session dictation.",
    "input_schema": {
        "type": "object",
        "properties": {
            field["id"]: build_json_schema_for_field(field)
            for field in template.fields
        },
        "required": [field["id"] for field in template.fields]
    }
}
```

Claude is required to call this tool. The API call must include `tool_choice: {"type": "tool", "name": "fill_custom_note"}` to force the model to use it. The response is parsed from the `tool_use` block → stored directly in `custom_fields` on `ClinicalNote`.

If no template exists → existing plain-text SOAP generation path runs unchanged.

---

## Note Review Screen

After dictation and generation, the right panel renders the custom note with fields displayed according to their type:

| Type | Rendered as |
|------|-------------|
| `text` | Read-only text block |
| `scale` | Row of 10 numbered circles, agent's value highlighted in sage |
| `checkbox` | Checked/unchecked list items per option |
| `list` | Dropdown-style chip showing selected value |
| `date` | Formatted date string |

Two actions at the bottom of the note:
- **Borrar nota** (red, outlined) — modal de confirmación → deletes the draft, workspace clears for re-dictation
- **Confirmar nota** (sage, primary) — saves to DB, triggers post-confirmation flow

---

## Post-Confirmation Flow

### Draft persistence

The dictation textarea auto-saves content as a draft (persisted in component state and optionally `localStorage`). A draft indicator ("Borrador guardado") is visible while text is present. The workspace does not clear until the psychologist explicitly confirms.

### On confirm

1. `POST /sessions/{session_id}/confirm` is called.
2. `ClinicalNote` is created with `custom_fields` populated and `status = confirmed`.
3. **Desktop:** The right panel switches automatically to the Historial tab. The newly saved note appears at the top with a "Nueva" badge. The left dictation panel clears and shows a toast "Sesión confirmada — nota guardada en historial".
4. **Mobile:** App navigates automatically to the Historial tab. Same toast and "Nueva" badge.
5. The "Nueva" badge is ephemeral — disappears on next navigation away from the patient.

---

## Desktop Layout — Sesión / Revisión Toggle

A toggle switch in the top-right of the main header controls the workspace mode. The label of the active side appears in bold.

**Sesión mode (default):**
- Left panel: dictation area with patient name + pencil icon at top
- Right panel: empty state ("Aún no hay nota generada") or note review when generated

**Revisión mode:**
- Left panel: session history list (date + session number, no field previews)
- Right panel: Evolución chat with suggested question chips

The sidebar always shows only the patient list — session entries are not shown in the sidebar.

---

## Mobile Layout

Four tabs: **Dictar · Nota · Historial · Evolución**

- **Dictar:** dictation textarea + draft indicator + generate button. Patient name + pencil icon in header.
- **Nota:** generated note with typed fields, confirm/delete actions.
- **Historial:** session cards (date + session number only, no field previews). Newly confirmed note at top with "Nueva" badge.
- **Evolución:** agent chat + colored suggestion chips (alternating sage and amber palette).

---

## Patient File (Expediente) Editing

### Desktop

A pencil SVG icon (stroke `#5a9e8a`) appears inline next to the patient's name above the dictation panel. Clicking it opens the existing "Nuevo paciente" modal component, pre-populated with the patient's current data. The modal title changes to "Editar expediente" and the submit button reads "Guardar cambios".

The sidebar patient list has no edit controls.

### Mobile

The same pencil SVG icon appears in the patient header (top right). Tapping it opens the same modal component as a bottom sheet sliding up from below, with a drag handle. Field labels use the project color palette: sage (`#5a9e8a`) for general fields, amber (`#c4935a`) for risk factors. The same component receives a `patient` prop — `null` = create mode, populated = edit mode.

---

## Backwards Compatibility

- All existing SOAP/DAP/BIRP notes are unaffected. The `custom_fields` column is nullable; legacy notes leave it null.
- If a psychologist has no template, the existing SOAP generation flow runs exactly as today.
- The `format` field on `Session` is a string column with existing values `soap`, `dap`, `birp`, `chat`. It gains a new value: `custom`. All existing values remain valid and unchanged.

---

## Out of Scope

- Multiple templates per psychologist (one template per psychologist, always)
- Sharing templates between psychologists
- Template versioning (replacing the template affects only new notes)
- AI-generated guiding questions in the wizard (psychologist writes them manually)

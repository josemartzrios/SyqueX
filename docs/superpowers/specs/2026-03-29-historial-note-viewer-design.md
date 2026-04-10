# Historial Note Viewer — Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Branch:** `feature/historial-note-viewer`

## Problem

The Historial tab lists past sessions but tapping them does nothing. The psychologist needs to review past SOAP notes without leaving the Historial context.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Interaction model | Accordion inline | Keeps user in context, no navigation away |
| Expand behavior | One at a time | Clean, focused — fits clinical review workflow |
| Note detail level | Full SOAP note | All 4 sections (S/O/A/P) with complete content |
| Rendering approach | Reuse `SoapNoteDocument` + `compact` prop | Single source of truth for SOAP rendering |
| Actions on note | Read-only | No actions needed for MVP |

## Behavior

1. User taps a session item in the Historial tab (mobile) or desktop sidebar history list
2. The item expands with a slide-down animation to reveal the full SOAP note
3. A chevron on the item rotates 180° to indicate expanded state
4. The expanded item gets a subtle sage border (`rgba(90,158,138,0.25)`)
5. If another session is already expanded, it collapses automatically
6. Tapping the expanded session collapses it

## Visual Spec

### Session item (collapsed)
- Background: `#f4f4f2` (parchment)
- Border-radius: `12px`
- Status dot: sage (`#5a9e8a`) for confirmed, amber (`#c4935a`) for pending
- Title: `13px` medium, ink color
- Preview: `12px`, muted, 2-line clamp of `raw_dictation`
- Status badge: `10px` uppercase
- Chevron: `16px`, muted color, right-aligned

### Session item (expanded)
- Background: `#fafaf9`
- Border: `1.5px solid rgba(90,158,138,0.25)`
- Chevron rotated 180°, sage color

### SOAP note (compact mode)
- No "Nota Clínica · SOAP" header
- Reduced padding: `16px 20px 20px` (vs full panel's `24px 24px`)
- Section divs separated by `24px` margin-top (except first)
- Same serif typography (Georgia), same sage labels, same thin rules
- Same `10px` uppercase small-caps section labels
- Content at `14px` with `1.6` line-height

## Component Changes

### `SoapNoteDocument.jsx`
- Add `compact` prop (boolean, default `false`)
- When `compact=true`:
  - Hide the "Nota Clínica · SOAP" header
  - Reduce outer padding from `px-6 py-6` to `px-5 py-4`
  - Add `mt-8` → `mt-6` for section spacing (or use CSS gap)

### `App.jsx`
- Add `expandedSessionId` state (number | null)
- `handleToggleSession(sessionId)` — toggles expand/collapse, ensures one-at-a-time
- **Mobile Historial tab:** make session items clickable, render `SoapNoteDocument` when expanded
- **Desktop sidebar history:** same accordion behavior

## Data Flow

No new API calls needed. Sessions in `sessionHistory` already contain `structured_note`, `detected_patterns`, `alerts`, and `ai_response` — all the data `SoapNoteDocument` needs is already loaded.

## Scope

**In scope:**
- Accordion expand/collapse with animation
- `compact` prop on `SoapNoteDocument`
- Mobile Historial tab
- Desktop sidebar history list

**Out of scope:**
- Actions on expanded note (copy, export, edit)
- Fetching additional data per session
- Evolución tab changes

## Mockup Reference

Visual mockup approved: `.superpowers/brainstorm/1153-1774843239/historial-mockup.html`

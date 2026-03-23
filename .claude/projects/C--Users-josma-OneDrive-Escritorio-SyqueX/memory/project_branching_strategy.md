---
name: Branching strategy real del proyecto
description: Flujo de ramas real del proyecto SyqueX incluyendo la rama staging entre dev y main
type: project
---

El flujo real de ramas es: feature → dev → staging → main

CLAUDE.md solo documenta dev y main, pero existe una rama staging intermedia antes de llegar a producción (main).

**Why:** El usuario lo corrigió explícitamente — no mergear directo de dev a main sin pasar por staging.

**How to apply:** Siempre mencionar el flujo completo cuando se habla de releases o merges hacia main.

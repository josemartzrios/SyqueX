---
trigger: always_on
---


  Aplica este skill SIEMPRE que el proyecto involucre código backend (FastAPI, Python,
  Node.js), APIs REST, manejo de datos de usuarios o pacientes, autenticación, base de
  datos, o cualquier sistema que necesite revisión de seguridad. Úsalo cuando el usuario
  pida: revisar seguridad, aplicar OWASP, hacer código más seguro, aplicar clean code,
  aplicar principios SOLID, refactorizar, auditar endpoints, revisar autenticación,
  manejar secretos, validar inputs, o cuando se detecte código que podría tener
  vulnerabilidades. También aplica cuando se genere código nuevo que involucre
  autenticación, queries a base de datos, manejo de archivos, llamadas a APIs externas,
  o procesamiento de datos sensibles (especialmente datos clínicos o de salud).
---

# Security + Clean Code + SOLID — Skill para PsicoAgente

Este skill guía la implementación de código seguro, limpio y bien estructurado
para el proyecto PsicoAgente. Cubre OWASP Top 10 (2021), principios SOLID,
y Clean Code adaptados a FastAPI + Python + PostgreSQL + datos clínicos.

> Para contexto de arquitectura del proyecto, consulta primero el prompt maestro.
> Este skill se aplica sobre ese stack específico.

---

## MODO DE USO

Cuando este skill se active, sigue este orden:
1. Lee la sección relevante de este archivo según la tarea
2. Si la tarea es revisión de código existente → ve a CHECKLIST DE AUDITORÍA
3. Si la tarea es generar código nuevo → ve a PATRONES DE IMPLEMENTACIÓN
4. Si la tarea es refactoring → lee SOLID + CLEAN CODE primero
5. Para referencias detalladas por vulnerabilidad → lee `references/owasp.md`
6. Para patrones de código concretos → lee `references/patterns.md`

---

## CONTEXTO DEL PROYECTO

Stack: FastAPI · Python 3.11 · SQLAlchemy 2.0 async · PostgreSQL + pgvector
       Anthropic Claude API · OpenAI Embeddings · React 18 · Datos clínicos (salud mental)

Consideraciones especiales:
- Los datos son DATOS DE SALUD — máxima sensibilidad
- El sistema tiene un agente LLM que ejecuta tools → superficie de ataque adicional
- Psicólogos son los usuarios principales → UX de seguridad debe ser no-intrusiva
- Los embeddings contienen información inferida del paciente → también son datos sensibles

---

## CHECKLIST DE AUDITORÍA RÁPIDA

Antes de aprobar cualquier PR o bloque de código, verificar:

### A1 — Broken Access Control
- [ ] Cada endpoint verifica que el psicólogo autenticado es dueño del paciente
- [ ] No hay IDs secuenciales expuestos (usar UUIDs)
- [ ] Rutas admin separadas y protegidas
- [ ] CORS configurado solo para orígenes permitidos

### A2 — Cryptographic Failures
- [ ] Passwords hasheados con bcrypt (cost factor ≥ 12)
- [ ] JWT firmado con RS256 (no HS256 con secreto débil)
- [ ] TLS forzado en producción (HTTPS everywhere)
- [ ] Datos sensibles en BD encriptados at-rest si el proveedor no lo hace automáticamente
- [ ] API keys NUNCA en código fuente ni logs

### A3 — Injection
- [ ] Cero SQL crudo — solo ORM SQLAlchemy con parámetros
- [ ] Inputs validados con Pydantic antes de llegar al agente
- [ ] Prompt injection mitigado (ver sección específica más abajo)
- [ ] Nombres de archivos sanitizados si se manejan uploads

### A4 — Insecure Design
- [ ] Principio de mínimo privilegio en roles (psicólogo solo ve SUS pacientes)
- [ ] Rate limiting en endpoints de autenticación y en el agente
- [ ] Flujo de confirmación humana antes de guardar notas (ya diseñado ✓)

### A5 — Security Misconfiguration
- [ ] Variables de entorno en .env, nunca hardcodeadas
- [ ] .env en .gitignore
- [ ] DEBUG=False en producción
- [ ] Headers de seguridad HTTP configurados

### A6 — Vulnerable Components
- [ ] requirements.txt con versiones fijadas (==, no >=)
- [ ] pip audit o safety check en CI
- [ ] Dependencias de frontend auditadas con npm audit

### A7 — Auth Failures
- [ ] Tokens JWT con expiración corta (15-60 min access, 7d refresh)
- [ ] Refresh tokens rotados en cada uso
- [ ] Logout invalida el refresh token (blacklist o rotación)
- [ ] Límite de intentos de login (5 intentos → bloqueo temporal)

### A8 — Software Integrity
- [ ] El agente no ejecuta código arbitrario (tools son funciones predefinidas)
- [ ] Respuestas del LLM no se ejecutan como código
- [ ] Webhooks verifican firma si los hay

### A9 — Logging Failures
- [ ] Logs de seguridad: logins, accesos a expedientes, cambios de nota
- [ ] NUNCA loguear: passwords, tokens, contenido de notas clínicas completo
- [ ] Logs estructurados (JSON) con timestamp, user_id, action, ip

### A10 — SSRF
- [ ] El agente no puede hacer requests a URLs arbitrarias
- [ ] Si hay fetch de URLs externas → allowlist de dominios

---

## MITIGACIÓN DE PROMPT INJECTION (específico para agentes LLM)

Este es el riesgo más específico del proyecto. El dictado del psicólogo
pasa como input al agente Claude. Un atacante podría intentar inyectar
instrucciones en el dictado.

Implementar SIEMPRE estas capas:

```python
# references/patterns.md → sección PROMPT_INJECTION para código completo

REGLAS:
1. El dictado del psicólogo va en un campo <dictation> XML delimitado
2. El system prompt del agente establece explícitamente qué ignorar
3. Las tools del agente son funciones Python fijas — el LLM no puede
   crear tools nuevas ni llamar código arbitrario
4. Validar longitud máxima del dictado (ej: 5000 caracteres)
5. Log de auditoría si el dictado contiene patrones sospechosos
```

---

## PRINCIPIOS SOLID APLICADOS AL PROYECTO

Lee `references/patterns.md` para ejemplos de código concretos.

### S — Single Responsibility
Cada clase/módulo tiene UNA razón para cambiar:
- `NoteStructurer` → solo estructura notas clínicas
- `PatternDetector` → solo detecta patrones entre sesiones
- `EmbeddingService` → solo genera y busca embeddings
- `SessionRepository` → solo acceso a datos de sesiones
NO mezclar: lógica de negocio + acceso a BD + llamadas a API en la misma clase

### O — Open/Closed
Las tools del agente deben poder añadirse SIN modificar el AgentRunner:
- Definir interfaz `BaseTool` (abstract)
- Cada tool implementa `BaseTool`
- `AgentRunner` recibe lista de tools en constructor
- Nuevo tool = nueva clase, cero cambios en AgentRunner

### L — Liskov Substitution
Si hay múltiples formatos de nota (SOAP, DAP, BIRP):
- Todos heredan de `ClinicalNoteFormat` (ABC)
- Cualquier formato puede reemplazar a otro sin romper el sistema
- Tests del padre pasan para todos los hijos

### I — Interface Segregation
No forzar dependencias que no se usan:
- `IReadRepository` (solo lectura) vs `IWriteRepository` (escritura)
- El agente usa `IReadRepository` para buscar historial
- El endpoint de confirmación usa `IWriteRepository` para guardar
- Esto facilita testing con mocks específicos

### D — Dependency Inversion
Depender de abstracciones, no de implementaciones concretas:
- El agente depende de `IEmbeddingService`, no de `OpenAIEmbeddingService`
- Si mañana cambias de OpenAI a Cohere → cero cambios en el agente
- Inyección de dependencias vía constructor o FastAPI Depends()

---

## PRINCIPIOS CLEAN CODE PARA ESTE PROYECTO

### Naming (Python / FastAPI)
```
# MAL
def proc(d, pid):
    r = db.exec(f"SELECT * FROM sessions WHERE patient_id = '{pid}'")
    return r

# BIEN
async def process_session_dictation(
    dictation: str,
    patient_id: UUID,
    db: AsyncSession = Depends(get_db)
) -> ClinicalNoteResponse:
    sessions = await session_repository.find_by_patient(patient_id, db)
    return await agent.process(dictation, sessions)
```

### Funciones
- Máximo 20 líneas por función
- Un nivel de abstracción por función
- Sin efectos secundarios ocultos
- Nombres de funciones = verbos: `create_note`, `detect_patterns`, `generate_embedding`

### No Magic Numbers/Strings
```python
# MAL
if len(dictation) > 5000:
    raise ValueError("too long")

# BIEN
class ClinicalNoteConfig:
    MAX_DICTATION_LENGTH: int = 5000
    MAX_SESSIONS_CONTEXT: int = 6
    EMBEDDING_DIMENSIONS: int = 1536
    TOKEN_EXPIRY_MINUTES: int = 60
```

### Error Handling Explícito
```python
# Nunca silenciar excepciones
# Nunca usar bare except:
# Siempre usar excepciones de dominio específicas
# Ver references/patterns.md → sección ERROR_HANDLING
```

---

## VARIABLES DE ENTORNO REQUERIDAS

Documentar en `.env.example` con descripción de cada una:
```
ANTHROPIC_API_KEY=          # Claude API key
OPENAI_API_KEY=             # Embeddings (text-embedding-3-small)
DATABASE_URL=               # postgresql+asyncpg://...
SECRET_KEY=                 # 32+ chars aleatorio (openssl rand -hex 32)
ALGORITHM=RS256             # JWT algorithm
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=            # https://tu-dominio.com (no * en producción)
ENVIRONMENT=development     # development | production
MAX_DICTATION_LENGTH=5000
RATE_LIMIT_LOGIN=5          # intentos por minuto
LOG_LEVEL=INFO
```

---

## REFERENCIAS DETALLADAS

- `references/owasp.md` → Implementación detallada de cada OWASP Top 10
  con ejemplos específicos para FastAPI + PostgreSQL + Agente LLM

- `references/patterns.md` → Código Python completo y listo para copiar:
  autenticación JWT, repositorio pattern, dependency injection,
  rate limiting, logging estructurado, prompt injection mitigation,
  manejo de errores de dominio, SOLID aplicado al agente
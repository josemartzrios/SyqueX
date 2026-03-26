import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from database import init_db
from api.limiter import limiter
from api.routes import router
from api.auth import router as auth_router
from config import settings
from exceptions import DomainError

logger = logging.getLogger("syquex")

# Deshabilitar docs automáticos en staging y producción
_hide_docs = settings.ENVIRONMENT in ("production", "staging")
app = FastAPI(
    title="SyqueX API",
    docs_url=None if _hide_docs else "/docs",
    redoc_url=None,
    openapi_url=None if _hide_docs else "/openapi.json",
)

# Security headers añadidos PRIMERO (quedan al interior del stack)
# CORS debe ser el middleware más exterior para que sus headers no sean
# bloqueados por BaseHTTPMiddleware — ver orden de add_middleware abajo.
async def _add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.is_production():
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    for header in ("X-Powered-By", "Server"):
        if header in response.headers:
            del response.headers[header]
    return response

app.add_middleware(BaseHTTPMiddleware, dispatch=_add_security_headers)

# CORS añadido AL FINAL — Starlette invierte el orden, así que este queda
# como el middleware más exterior y sus headers llegan al cliente sin ser
# filtrados por BaseHTTPMiddleware.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_origin_regex=r"https://syquex(-[a-z0-9]+)*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Rate limit exceeded — respuesta sin revelar detalles internos
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Domain errors — mapeados a su http_status correspondiente
@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    logger.warning(
        "Domain error [%s]: %s — %s %s",
        exc.code, exc.message, request.method, request.url.path,
    )
    return JSONResponse(
        status_code=exc.http_status,
        content={"detail": exc.message, "code": exc.code},
    )


# Manejador global — nunca exponer stack traces al cliente
@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
    )

@app.on_event("startup")
async def startup_event():
    import os
    raw = os.environ.get("ALLOWED_ORIGINS", "NOT_SET")
    parsed = settings.get_allowed_origins()
    print(f"[CORS_DEBUG] raw env: {repr(raw)}", flush=True)
    print(f"[CORS_DEBUG] parsed origins: {parsed}", flush=True)
    await init_db()

app.include_router(auth_router, prefix="/api/v1")
app.include_router(router, prefix="/api/v1")

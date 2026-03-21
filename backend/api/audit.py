"""
Utilidad de auditoría clínica — SyqueX
Registra operaciones sobre datos clínicos SIN incluir contenido sensible (PII, notas SOAP).
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from database import AuditLog

logger = logging.getLogger("syquex.audit")


async def log_audit(
    db: AsyncSession,
    action: str,
    entity: str,
    entity_id: Optional[str] = None,
    psychologist_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """
    Inserta un registro de auditoría.
    IMPORTANTE: nunca pasar datos clínicos en metadata — solo IDs y contadores.
    """
    entry = AuditLog(
        psychologist_id=psychologist_id,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id else None,
        ip_address=ip_address,
        extra=metadata,
    )
    db.add(entry)
    # No commit aquí — se commitea junto con la operación principal
    logger.info(
        '{"event":"audit","action":"%s","entity":"%s","entity_id":"%s","psy":"%s"}',
        action, entity, entity_id, psychologist_id,
    )

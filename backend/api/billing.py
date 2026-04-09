import os
import stripe
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from database import get_db, Subscription, ProcessedStripeEvent
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from .auth import get_current_psychologist

router = APIRouter()
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

@router.get("/status")
async def get_billing_status(
    psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Subscription).where(Subscription.psychologist_id == psychologist.id)
    )
    sub = result.scalar_one_or_none()
    
    if not sub:
        # Esto no debería pasar porque se crea en register
        return {"status": "trialing", "days_remaining": 0}
        
    if sub.status == 'trialing':
        if not sub.trial_end:
            sub.trial_end = datetime.now(timezone.utc)
            await db.commit()
        # Asegurarse de que trial_end tiene timezone antes de restar (trial_end es UTC pero asyncpg podría devolver offset-naive si no está bien mapeado)
        trial_end = sub.trial_end.replace(tzinfo=timezone.utc) if sub.trial_end.tzinfo is None else sub.trial_end
        days = (trial_end - datetime.now(timezone.utc)).days
        return {"status": "trialing", "days_remaining": max(0, days)}
        
    return {
        "status": sub.status,
        "current_period_end": sub.current_period_end
    }

@router.post("/checkout")
async def create_checkout_session(
    psychologist = Depends(get_current_psychologist),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Subscription).where(Subscription.psychologist_id == psychologist.id)
    )
    sub = result.scalar_one_or_none()
    
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
        
    try:
        session = stripe.checkout.Session.create(
            customer=sub.stripe_customer_id,
            line_items=[{
                'price': os.getenv('STRIPE_PRICE_ID'),
                'quantity': 1,
            }],
            mode='subscription',
            success_url=f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/?success=true",
            cancel_url=f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/",
            metadata={'psychologist_id': psychologist.id}
        )
        return {"checkout_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, os.getenv('STRIPE_WEBHOOK_SECRET', '')
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail="Firma inválida")

    # Idempotencia
    result = await db.execute(
        select(ProcessedStripeEvent).where(ProcessedStripeEvent.id == event.id)
    )
    if result.scalar_one_or_none():
        return {"status": "already_processed"}
        
    # Guardar evento
    db.add(ProcessedStripeEvent(id=event.id, type=event.type))

    # Manejar pago exitoso
    if event.type == 'checkout.session.completed':
        session = event.data.object
        if session.mode == 'subscription':
            psychologist_id = session.metadata.get('psychologist_id')
            if psychologist_id:
                sub_result = await db.execute(
                    select(Subscription).where(Subscription.psychologist_id == int(psychologist_id))
                )
                sub = sub_result.scalar_one_or_none()
                if sub:
                    sub.stripe_subscription_id = session.subscription
                    sub.status = 'active'
    
    elif event.type == 'invoice.payment_succeeded':
        # Actualizar fecha de fin de periodo
        invoice = event.data.object
        if invoice.subscription:
            sub = stripe.Subscription.retrieve(invoice.subscription)
            db_sub_res = await db.execute(
                select(Subscription).where(Subscription.stripe_subscription_id == invoice.subscription)
            )
            db_sub = db_sub_res.scalar_one_or_none()
            if db_sub:
                db_sub.status = sub.status
                db_sub.current_period_end = datetime.fromtimestamp(sub.current_period_end, timezone.utc)

    elif event.type in ['customer.subscription.deleted', 'customer.subscription.updated']:
        stripe_sub = event.data.object
        db_sub_res = await db.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub.id)
        )
        db_sub = db_sub_res.scalar_one_or_none()
        if db_sub:
            db_sub.status = stripe_sub.status
            db_sub.current_period_end = datetime.fromtimestamp(stripe_sub.current_period_end, timezone.utc)

    await db.commit()
    return {"status": "success"}

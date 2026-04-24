import os
import stripe
from dotenv import load_dotenv

# Cargar variables de entorno si existen
load_dotenv()

def setup_stripe():
    print("--- SyqueX Stripe Test Mode Setup ---")
    
    api_key = os.getenv("STRIPE_SECRET_KEY")
    if not api_key:
        api_key = input("Introduce tu Stripe Secret Key (sk_test_...): ").strip()
    
    if not api_key.startswith("sk_test_"):
        print("Error: Se requiere una clave de TEST (sk_test_...).")
        return

    stripe.api_key = api_key

    # 1. Crear Producto
    try:
        product_name = "SyqueX Pro"
        # Buscar si ya existe
        products = stripe.Product.list(limit=100)
        product = next((p for p in products.data if p.name == product_name), None)
        
        if not product:
            product = stripe.Product.create(
                name=product_name,
                description="Suscripción Pro para psicólogos - SyqueX",
            )
            print(f"Producto creado: {product.id}")
        else:
            print(f"Producto ya existe: {product.id}")

        # 2. Crear Precio (Mensual, MXN, 499)
        prices = stripe.Price.list(product=product.id, active=True)
        price = next((p for p in prices.data if p.currency == "mxn" and p.recurring.interval == "month"), None)
        
        if not price:
            amount = 49900  # 499.00 MXN
            price = stripe.Price.create(
                product=product.id,
                unit_amount=amount,
                currency="mxn",
                recurring={"interval": "month"},
            )
            print(f"Precio creado: {price.id} ({amount/100} MXN/mes)")
        else:
            print(f"Precio ya existe: {price.id}")

        print("\n--- PASO 1 COMPLETADO ---")
        print(f"STRIPE_PRICE_ID={price.id}")
        print(f"STRIPE_SECRET_KEY={api_key}")
        
        # 3. Instrucciones para Webhook
        print("\n--- PASO 2: CONFIGURAR WEBHOOK ---")
        print("1. Ve a https://dashboard.stripe.com/test/webhooks")
        print("2. Haz clic en 'Add endpoint'")
        railway_url = input("Introduce tu URL de Railway (ej: https://syquex-production.up.railway.app): ").strip().rstrip("/")
        webhook_url = f"{railway_url}/api/v1/billing/webhook"
        print(f"3. URL del endpoint: {webhook_url}")
        print("4. Selecciona estos 5 eventos:")
        print("   - checkout.session.completed")
        print("   - invoice.payment_succeeded")
        print("   - invoice.payment_failed")
        print("   - customer.subscription.deleted")
        print("   - customer.subscription.updated")
        print("5. Copia el 'Signing secret' (whsec_...)")
        
        print("\n--- PASO 3: VARIABLES EN RAILWAY ---")
        print("Añade estas 3 variables en Railway Settings -> Variables:")
        print(f"STRIPE_SECRET_KEY={api_key}")
        print(f"STRIPE_PRICE_ID={price.id}")
        print("STRIPE_WEBHOOK_SECRET=whsec_... (el que copiaste en el paso anterior)")

    except Exception as e:
        print(f"Error durante la configuración: {e}")

if __name__ == "__main__":
    setup_stripe()

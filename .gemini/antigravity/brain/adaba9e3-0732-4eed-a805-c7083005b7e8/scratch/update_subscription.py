
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://psicoagente:psicoagente_dev@localhost/psicoagente"

async def update_status():
    engine = create_async_engine(DATABASE_URL)
    
    async with engine.begin() as conn:
        # Check if user exists
        result = await conn.execute(
            text("SELECT id FROM psychologists WHERE email = :email"),
            {"email": "ana@syquex.com"}
        )
        user = result.fetchone()
        
        if not user:
            print("Error: User 'ana@syquex.com' not found.")
            return

        psychologist_id = user[0]
        print(f"Found psychologist ID: {psychologist_id}")

        # Update subscription status
        result = await conn.execute(
            text("UPDATE subscriptions SET status = 'active' WHERE psychologist_id = :psychologist_id"),
            {"psychologist_id": psychologist_id}
        )
        
        if result.rowcount > 0:
            print(f"Successfully updated subscription status for {psychologist_id} to 'active'.")
        else:
            print(f"No subscription found for psychologist ID {psychologist_id} to update.")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(update_status())

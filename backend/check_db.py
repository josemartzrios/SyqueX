import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

async def check_db():
    url = os.getenv("DATABASE_URL")
    print(f"Checking database at: {url}")
    try:
        engine = create_async_engine(url)
        async with engine.connect() as conn:
            # Check version
            res = await conn.execute(text("SELECT version();"))
            row = res.fetchone()
            print(f"\n✅ Connection Successful!")
            print(f"Version: {row[0]}")
            
            # List tables
            res_tables = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public';"))
            tables = res_tables.fetchall()
            print("\nTables found in 'public' schema:")
            for t in tables:
                print(f"- {t[0]}")
    except Exception as e:
        print(f"\n❌ Error connecting to DB: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())

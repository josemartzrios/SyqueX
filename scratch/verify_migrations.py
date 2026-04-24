import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from database import init_db

async def main():
    print("Initializing database...")
    try:
        await init_db()
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())

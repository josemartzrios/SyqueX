import asyncio
from config import settings
from anthropic import AsyncAnthropic

async def run():
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    try:
        r = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=100,
            messages=[{"role": "user", "content": "hola"}]
        )
        print("✅ ÉXITO SIN TOOLS:", r.model, r.content)
    except Exception as e:
        print("❌ FALLO SIN TOOLS:", e)

asyncio.run(run())

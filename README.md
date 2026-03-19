# PsicoAgente / Syquex

Aplicación full-stack para estructuración e inteligencia clínica de notas de psicología.
Esta arquitectura está optimizada para **producción** utilizando el stack:
- **Frontend**: React + Vite alojado en **Vercel**
- **Backend**: FastAPI desplegado en **Railway**
- **Base de datos**: PostgreSQL con pgvector en **Supabase**

## Desarrollo Local (Inicio Rápido)

```bash
# 1. Variables de entorno (Backend)
cd backend
cp ../.env.example .env
# Edita .env con tus API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY y DATABASE_URL de Supabase)

# 2. Base de Datos
# Puedes usar la DB en la nube de Supabase, o levantar postgreSQL local temporalmente:
docker-compose up -d postgres

# 3. Backend
pip install -r requirements.txt
python seed.py
uvicorn main:app --reload

# 4. Frontend
cd ../frontend
# Crea un archivo .env.local para Vite si quieres apuntar al backend local:
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm install
npm run dev
```

## Guía de Despliegue en Producción

### 1. Supabase (Base de Datos)
1. Crea un nuevo proyecto en Supabase.
2. Ve a Database -> Extensions y habilita `vector`.
3. Obtén tu "Connection string" (URI) y úsala en el entorno de Railway como `DATABASE_URL`.
   *Nota: Reemplaza `postgresql://` por `postgresql+asyncpg://` para usar con nuestro backend y asegúrate de agregar pooler mode si es sugerido por Supabase.*

### 2. Railway (Backend)
1. Crea un nuevo proyecto en Railway.
2. Conecta tu repositorio de GitHub y selecciona publicar el subdirectorio `backend`.
3. Railway detectará el `Dockerfile` automáticamente.
4. En **Variables**, configura:
   - `DATABASE_URL` = (tu string de Supabase)
   - `OPENAI_API_KEY` = (tu API Key)
   - `ANTHROPIC_API_KEY` = (tu API Key)
5. Al desplegar, Railway otorgará una URL pública (ej: `https://psicoagente-backend.up.railway.app`).

### 3. Vercel (Frontend)
1. Crea un nuevo proyecto en Vercel.
2. Conecta el repositorio de GitHub y establece el "Root Directory" como `frontend`.
3. Vercel detectará que es un proyecto Vite/React automáticamete.
4. En **Environment Variables**, configura:
   - `VITE_API_URL` = (la URL pública que te dio Railway)
5. Haz clic en "Deploy". Vercel compilará la SPA y proveerá la URL pública.

## Flujo de uso
El sistema cargará el dashboard "Juan Martínez". Escribe el dictado en lenguaje natural, y el agente procesará la nota consultando la base vectorial en Supabase y utilizando el backend escalable en Railway.

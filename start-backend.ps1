# SyqueX — Levantar Backend
$BackendDir = "C:\Users\josma\OneDrive\Escritorio\SyqueX\backend"
$Python311  = "C:\Users\josma\AppData\Local\Programs\Python\Python311\python.exe"

Set-Location $BackendDir

# Crear venv con Python 3.11 si no existe
if (-not (Test-Path "$BackendDir\venv")) {
    Write-Host "Creando venv con Python 3.11..."
    & $Python311 -m venv venv
}

# Activar venv
& "$BackendDir\venv\Scripts\Activate.ps1"

# Instalar/actualizar dependencias
pip install -r requirements.txt

# Seed con datos demo (3 pacientes x 6 sesiones)
# Login: ana@syquex.demo / demo1234
Write-Host "Cargando datos demo..."
python seed_demo.py

# Levantar servidor
uvicorn main:app --reload

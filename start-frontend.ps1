# SyqueX — Levantar Frontend
Set-Location "$PSScriptRoot\frontend"

# Instalar dependencias si no existe node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias npm..."
    npm install
}

# Levantar servidor de desarrollo
npm run dev

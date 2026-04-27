# SyqueX — Git Sync Utility
# Este script actualiza main y dev con el remoto sin perder tu progreso actual

$currentBranch = (git branch --show-current)
Write-Host "--- Sincronizando SyqueX con Remoto ---" -ForegroundColor Cyan

# 1. Guardar cambios actuales si existen
$hasChanges = (git status --porcelain)
if ($hasChanges) {
    Write-Host "Guardando cambios temporales (stash)..." -ForegroundColor Yellow
    git stash
}

# 2. Actualizar referencias
Write-Host "Buscando cambios en el servidor..."
git fetch --all --prune

# 3. Actualizar Main
Write-Host "Actualizando local 'main'..." -ForegroundColor Green
git checkout main
git reset --hard origin/main

# 4. Actualizar Dev
Write-Host "Actualizando local 'dev'..." -ForegroundColor Green
git checkout dev
git reset --hard origin/dev

# 5. Volver a la rama original
Write-Host "Regresando a $currentBranch..." -ForegroundColor Cyan
git checkout $currentBranch

# 6. Recuperar cambios si hubo stash
if ($hasChanges) {
    Write-Host "Recuperando tus cambios..." -ForegroundColor Yellow
    git stash pop
}

Write-Host "`n✅ ¡Todo sincronizado! Main y Dev están al día con el remoto." -ForegroundColor Green

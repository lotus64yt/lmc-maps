@echo off
echo ===================================
echo    NETTOYAGE COMPLET DU PROJET
echo ===================================
echo.
echo ATTENTION: Cette opération va supprimer tous les caches et node_modules
echo Voulez-vous continuer? (o/n)
set /p confirm=
if /i "%confirm%" neq "o" (
    echo Opération annulée.
    pause
    exit /b 0
)

echo.
echo [1/6] Restauration des fichiers de configuration...

REM Restaurer les sauvegardes s'il y en a
if exist ".env.backup" (
    move ".env.backup" ".env" >nul 2>&1
    echo ✓ .env restauré depuis la sauvegarde
)

if exist "config\SafetyTestConfig.ts.backup" (
    move "config\SafetyTestConfig.ts.backup" "config\SafetyTestConfig.ts" >nul 2>&1
    echo ✓ SafetyTestConfig.ts restauré depuis la sauvegarde
)

if exist "app.json.backup" (
    move "app.json.backup" "app.json" >nul 2>&1
    echo ✓ app.json restauré depuis la sauvegarde
)

echo.
echo [2/6] Suppression des node_modules...
if exist "node_modules" (
    rmdir /s /q "node_modules"
    echo ✓ node_modules supprimé
) else (
    echo ✓ node_modules déjà absent
)

echo.
echo [3/6] Suppression des caches Expo...
call npx expo r -c
echo ✓ Cache Expo nettoyé

echo.
echo [4/6] Suppression des caches npm...
call npm cache clean --force
echo ✓ Cache npm nettoyé

echo.
echo [5/6] Suppression des fichiers temporaires...
if exist ".expo" rmdir /s /q ".expo"
if exist "dist" rmdir /s /q "dist"
if exist "web-build" rmdir /s /q "web-build"
if exist "*.log" del "*.log"
if exist ".env.backup" del ".env.backup"
if exist "config\SafetyTestConfig.ts.backup" del "config\SafetyTestConfig.ts.backup"
if exist "app.json.backup" del "app.json.backup"
echo ✓ Fichiers temporaires supprimés

echo.
echo [6/6] Réinstallation des dépendances...
call npm install
if %errorlevel% neq 0 (
    echo ERREUR: Échec de la réinstallation
    pause
    exit /b 1
)
echo ✓ Dépendances réinstallées

echo.
echo ===================================
echo    NETTOYAGE TERMINÉ !
echo ===================================
echo Le projet est maintenant dans un état propre.
echo.
echo Configuration actuelle:
call npx ts-node -e "import { SafetyTestConfig } from './config/SafetyTestConfig'; SafetyTestConfig.logConfiguration();" 2>nul || echo "Impossible de lire la configuration TypeScript"
echo.
pause

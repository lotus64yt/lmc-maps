@echo off
echo ===================================
echo    BUILD PRODUCTION POUR GOOGLE PLAY
echo ===================================
echo.

REM Arrêter en cas d'erreur
setlocal enabledelayedexpansion

REM Vérifier si nous sommes dans le bon répertoire
if not exist "package.json" (
    echo ERREUR: package.json non trouvé. Veuillez exécuter ce script depuis la racine du projet.
    pause
    exit /b 1
)

echo [1/8] Demande du nom de l'application pour Google Play...
echo.
set /p app_name="Entrez le nom de l'application pour Google Play (ex: LMC Maps): "
if "!app_name!"=="" (
    set app_name=LMC Maps
    echo Nom par défaut utilisé: LMC Maps
)
echo ✓ Nom d'application: !app_name!
echo.

echo [2/8] Configuration de l'environnement de production...
echo.

REM Sauvegarder les fichiers actuels
if exist ".env" (
    copy ".env" ".env.backup" >nul 2>&1
    echo Sauvegarde de .env effectuée
)

if exist "config\SafetyTestConfig.ts" (
    copy "config\SafetyTestConfig.ts" "config\SafetyTestConfig.ts.backup" >nul 2>&1
    echo Sauvegarde de SafetyTestConfig.ts effectuée
)

if exist "app.json" (
    copy "app.json" "app.json.backup" >nul 2>&1
    echo Sauvegarde de app.json effectuée
)

REM Créer/Écraser le fichier .env pour la production
echo # Configuration Production > .env
echo NODE_ENV=production >> .env
echo EAS_BUILD_PLATFORM=android >> .env
echo EXPO_PUBLIC_API_URL=https://api.lmc-maps.com >> .env
echo EXPO_PUBLIC_ENVIRONMENT=production >> .env
echo EXPO_PUBLIC_DEBUG=false >> .env
echo EXPO_PUBLIC_LOG_LEVEL=error >> .env
echo EXPO_PUBLIC_ANALYTICS_ENABLED=true >> .env
echo EXPO_PUBLIC_SENTRY_ENABLED=true >> .env

echo ✓ Variables d'environnement de production configurées
echo.

echo [3/8] Configuration de SafetyTestConfig.ts pour la production...
echo.
(
echo /**
echo  * Configuration de Test pour le Système de Sécurité Routière
echo  * 
echo  * Ce fichier centralise toutes les variables temporelles du système de sécurité routière
echo  * pour faciliter les tests et éviter d'oublier de remettre les vraies valeurs en production.
echo  * 
echo  * IMPORTANT: Avant de déployer en production, s'assurer que IS_TEST_MODE = false
echo  */
echo.
echo export class SafetyTestConfig {
echo   // ⚠️ MODE TEST - Mettre à false pour la production
echo   public static readonly IS_TEST_MODE = false;
echo.
echo   // 🕐 SEUIL DE DÉCLENCHEMENT DU MODAL DE SÉCURITÉ
echo   // Production: 120 minutes ^(2 heures^)
echo   // Test: 5 minutes pour déclencher facilement
echo   public static readonly LONG_TRIP_THRESHOLD_MINUTES = SafetyTestConfig.IS_TEST_MODE ? 5 : 120;
echo.
echo   // ⏰ DÉLAI DU RAPPEL DE PAUSE
echo   // Production: 2 heures ^(7200 secondes^)
echo   // Test: 10 secondes pour voir rapidement le rappel
echo   public static readonly REMINDER_DELAY_SECONDS = SafetyTestConfig.IS_TEST_MODE ? 10 : 7200;
echo.
echo   // 🔄 DÉLAI DU RAPPEL RÉPÉTÉ ^(quand on ignore^)
echo   // Production: 2 heures ^(7200 secondes^)
echo   // Test: 10 secondes pour tester les rappels répétés
echo   public static readonly REPEATED_REMINDER_DELAY_SECONDS = SafetyTestConfig.IS_TEST_MODE ? 10 : 7200;
echo.
echo   // 📝 MESSAGES INFORMATIFS
echo   public static getConfigInfo^(^): string {
echo     return `
echo 🚗 Configuration Système de Sécurité Routière:
echo - Mode: ${SafetyTestConfig.IS_TEST_MODE ? 'TEST' : 'PRODUCTION'}
echo - Seuil long trajet: ${SafetyTestConfig.LONG_TRIP_THRESHOLD_MINUTES} minutes
echo - Délai rappel: ${SafetyTestConfig.REMINDER_DELAY_SECONDS} secondes
echo - Délai rappel répété: ${SafetyTestConfig.REPEATED_REMINDER_DELAY_SECONDS} secondes
echo     `;
echo   }
echo.
echo   // 🔧 FONCTIONS UTILITAIRES
echo   
echo   /**
echo    * Convertit le délai de rappel en millisecondes
echo    */
echo   public static getReminderDelayMs^(^): number {
echo     return SafetyTestConfig.REMINDER_DELAY_SECONDS * 1000;
echo   }
echo.
echo   /**
echo    * Convertit le délai de rappel répété en millisecondes
echo    */
echo   public static getRepeatedReminderDelayMs^(^): number {
echo     return SafetyTestConfig.REPEATED_REMINDER_DELAY_SECONDS * 1000;
echo   }
echo.
echo   /**
echo    * Vérifie si une durée de trajet déclenche le modal de sécurité
echo    */
echo   public static shouldShowSafetyModal^(durationInMinutes: number^): boolean {
echo     return durationInMinutes ^> SafetyTestConfig.LONG_TRIP_THRESHOLD_MINUTES;
echo   }
echo.
echo   /**
echo    * Formate la durée pour l'affichage dans le modal
echo    */
echo   public static formatDuration^(durationInMinutes: number^): string {
echo     const hours = Math.floor^(durationInMinutes / 60^);
echo     const minutes = durationInMinutes %% 60;
echo     return `${hours}h${String^(minutes^).padStart^(2, '0'^)}`;
echo   }
echo.
echo   /**
echo    * Log de diagnostic pour vérifier la configuration
echo    */
echo   public static logConfiguration^(^): void {
echo     console.log^('🔧 ' + SafetyTestConfig.getConfigInfo^(^)^);
echo     
echo     if ^(SafetyTestConfig.IS_TEST_MODE^) {
echo       console.warn^('⚠️ ATTENTION: Mode test activé - Ne pas déployer en production!'^);
echo       console.log^('🧪 En mode test: POI recherchés à 10 minutes ^(0.17h^) de votre position future'^);
echo     } else {
echo       console.log^('🚗 En mode production: POI recherchés à 2h de votre position future'^);
echo     }
echo   }
echo }
echo.
echo // 📋 CHECKLIST AVANT PRODUCTION:
echo // [✓] Vérifier que IS_TEST_MODE = false
echo // [✓] Vérifier que LONG_TRIP_THRESHOLD_MINUTES = 120
echo // [✓] Vérifier que REMINDER_DELAY_SECONDS = 7200
echo // [✓] Vérifier que REPEATED_REMINDER_DELAY_SECONDS = 7200
echo // [✓] Tester avec un trajet de plus de 2h réelles
echo // [✓] Vérifier que les rappels arrivent après 2h réelles
) > "config\SafetyTestConfig.ts"

echo ✓ SafetyTestConfig.ts configuré pour la PRODUCTION (IS_TEST_MODE = false)
echo.

echo [4/8] Configuration de app.json avec le nom personnalisé...
echo.
powershell -Command "& { $json = Get-Content 'app.json' | ConvertFrom-Json; $json.expo.name = '!app_name!'; $json | ConvertTo-Json -Depth 10 | Set-Content 'app.json' }"
echo ✓ app.json mis à jour avec le nom: !app_name!
echo.

echo [5/8] Nettoyage du cache...
echo.
call npx expo install --fix
call npx expo r -c
echo ✓ Cache nettoyé
echo.

echo [6/8] Vérification des dépendances...
echo.
call npm ci
if !errorlevel! neq 0 (
    echo ERREUR: Échec de l'installation des dépendances
    goto :restore_env
)
echo ✓ Dépendances installées
echo.

echo [7/8] Construction du build de production...
echo.
echo Lancement du build pour Google Play Store...
call eas build --platform android --profile production --non-interactive
if !errorlevel! neq 0 (
    echo ERREUR: Échec du build de production
    goto :restore_env
)
echo ✓ Build de production terminé avec succès
echo.

echo [8/8] Nettoyage...
goto :restore_env

:restore_env
echo Restauration de l'environnement...
if exist ".env.backup" (
    move ".env.backup" ".env" >nul 2>&1
    echo ✓ Fichier .env restauré
) else (
    del ".env" >nul 2>&1
    echo ✓ Fichier .env temporaire supprimé
)

if exist "config\SafetyTestConfig.ts.backup" (
    move "config\SafetyTestConfig.ts.backup" "config\SafetyTestConfig.ts" >nul 2>&1
    echo ✓ SafetyTestConfig.ts restauré
) else (
    echo ⚠️ SafetyTestConfig.ts reste en mode production
)

if exist "app.json.backup" (
    move "app.json.backup" "app.json" >nul 2>&1
    echo ✓ app.json restauré
) else (
    echo ⚠️ app.json garde le nom personnalisé
)
echo.

if !errorlevel! equ 0 (
    echo ===================================
    echo    BUILD PRODUCTION TERMINÉ !
    echo ===================================
    echo.
    echo Nom de l'application: !app_name!
    echo Configuration: PRODUCTION (SafetyTestConfig.IS_TEST_MODE = false)
    echo.
    echo Le build est maintenant disponible sur:
    echo https://expo.dev/accounts/votre-compte/projects/lmc-maps/builds
    echo.
    echo Prochaines étapes:
    echo 1. Télécharger le fichier .aab depuis EAS
    echo 2. Uploader sur Google Play Console
    echo 3. Tester en interne puis publier
    echo.
    echo ✓ Configuration de sécurité: MODE PRODUCTION activé
    echo   - Seuil long trajet: 120 minutes (2 heures)
    echo   - Délai rappel: 7200 secondes (2 heures)
    echo.
) else (
    echo ===================================
    echo    ERREUR DURANT LE BUILD
    echo ===================================
    echo Vérifiez les logs ci-dessus pour plus de détails.
    echo.
)

pause
endlocal

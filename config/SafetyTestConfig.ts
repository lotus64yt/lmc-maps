/**
 * Configuration de Test pour le Système de Sécurité Routière
 * 
 * Ce fichier centralise toutes les variables temporelles du système de sécurité routière
 * pour faciliter les tests et éviter d'oublier de remettre les vraies valeurs en production.
 * 
 * IMPORTANT: Avant de déployer en production, s'assurer que IS_TEST_MODE = false
 */

export class SafetyTestConfig {
  // ⚠️ MODE TEST - Mettre à false pour la production
  public static readonly IS_TEST_MODE = false;

  // 🕐 SEUIL DE DÉCLENCHEMENT DU MODAL DE SÉCURITÉ
  // Production: 120 minutes (2 heures)
  // Test: 5 minutes pour déclencher facilement
  public static readonly LONG_TRIP_THRESHOLD_MINUTES = SafetyTestConfig.IS_TEST_MODE ? 5 : 120;

  // ⏰ DÉLAI DU RAPPEL DE PAUSE
  // Production: 2 heures (7200 secondes)
  // Test: 10 secondes pour voir rapidement le rappel
  public static readonly REMINDER_DELAY_SECONDS = SafetyTestConfig.IS_TEST_MODE ? 10 : 7200;

  // 🔄 DÉLAI DU RAPPEL RÉPÉTÉ (quand on ignore)
  // Production: 2 heures (7200 secondes)
  // Test: 10 secondes pour tester les rappels répétés
  public static readonly REPEATED_REMINDER_DELAY_SECONDS = SafetyTestConfig.IS_TEST_MODE ? 10 : 7200;

  // 📝 MESSAGES INFORMATIFS
  public static getConfigInfo(): string {
    return `
🚗 Configuration Système de Sécurité Routière:
- Mode: ${SafetyTestConfig.IS_TEST_MODE ? 'TEST' : 'PRODUCTION'}
- Seuil long trajet: ${SafetyTestConfig.LONG_TRIP_THRESHOLD_MINUTES} minutes
- Délai rappel: ${SafetyTestConfig.REMINDER_DELAY_SECONDS} secondes
- Délai rappel répété: ${SafetyTestConfig.REPEATED_REMINDER_DELAY_SECONDS} secondes
    `;
  }

  // 🔧 FONCTIONS UTILITAIRES
  /**
   * Convertit le délai de rappel en millisecondes
   */
  public static getReminderDelayMs(): number {
    return SafetyTestConfig.REMINDER_DELAY_SECONDS * 1000;
  }

  /**
   * Convertit le délai de rappel répété en millisecondes
   */
  public static getRepeatedReminderDelayMs(): number {
    return SafetyTestConfig.REPEATED_REMINDER_DELAY_SECONDS * 1000;
  }

  /**
   * Vérifie si une durée de trajet déclenche le modal de sécurité
   */
  public static shouldShowSafetyModal(durationInMinutes: number): boolean {
    return durationInMinutes > SafetyTestConfig.LONG_TRIP_THRESHOLD_MINUTES;
  }

  /**
   * Formate la durée pour l'affichage dans le modal
   */
  public static formatDuration(durationInMinutes: number): string {
    const hours = Math.floor(durationInMinutes / 60);
    const minutes = durationInMinutes % 60;
    return `${hours}h${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Log de diagnostic pour vérifier la configuration
   */
  public static logConfiguration(): void {
  console.log('🔧 ' + SafetyTestConfig.getConfigInfo());
  if (SafetyTestConfig.IS_TEST_MODE) {
    console.warn('⚠️ ATTENTION: Mode test activé - Ne pas déployer en production');
    console.log('🧪 En mode test: POI recherchés à 10 minutes (0.17h) de votre position future');
  } else {
    console.log('🚗 En mode production: POI recherchés à 2h de votre position future');
  }
}
}

// 📋 CHECKLIST AVANT PRODUCTION:
// [ ] Vérifier que IS_TEST_MODE = false
// [ ] Vérifier que LONG_TRIP_THRESHOLD_MINUTES = 120
// [ ] Vérifier que REMINDER_DELAY_SECONDS = 7200
// [ ] Vérifier que REPEATED_REMINDER_DELAY_SECONDS = 7200
// [ ] Tester avec un trajet de plus de 2h réelles
// [ ] Vérifier que les rappels arrivent après 2h réelles

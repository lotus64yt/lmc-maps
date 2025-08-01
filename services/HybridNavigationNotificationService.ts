import { NavigationNotificationService } from './NavigationNotificationService';
import { FallbackNavigationNotificationService, NavigationStep, NavigationProgress } from './FallbackNavigationNotificationService';

export class HybridNavigationNotificationService {
  private static useExpoNotifications = true;
  private static initialized = false;

  // Initialiser et détecter quel service utiliser
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Tester si les notifications Expo fonctionnent
      const hasPermission = await NavigationNotificationService.requestPermissions();
      this.useExpoNotifications = hasPermission;
      console.log('Using Expo notifications:', this.useExpoNotifications);
    } catch (error) {
      console.log('Expo notifications not available, using fallback alerts:', error);
      this.useExpoNotifications = false;
    }

    this.initialized = true;
  }

  // Démarrer les notifications de navigation
  static async startNavigationNotifications(): Promise<void> {
    await this.initialize();
    
    if (this.useExpoNotifications) {
      await NavigationNotificationService.startNavigationNotifications();
    } else {
      await FallbackNavigationNotificationService.startNavigationNotifications();
    }
  }

  // Arrêter les notifications de navigation
  static async stopNavigationNotifications(): Promise<void> {
    if (this.useExpoNotifications) {
      await NavigationNotificationService.stopNavigationNotifications();
    } else {
      await FallbackNavigationNotificationService.stopNavigationNotifications();
    }
  }

  // Afficher une notification de navigation
  static async showNavigationNotification(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): Promise<void> {
    if (this.useExpoNotifications) {
      await NavigationNotificationService.showNavigationNotification(currentStep, progress);
    } else {
      await FallbackNavigationNotificationService.showNavigationNotification(currentStep, progress);
    }
  }

  // Afficher une notification d'arrivée
  static async showArrivalNotification(destinationName: string): Promise<void> {
    if (this.useExpoNotifications) {
      await NavigationNotificationService.showArrivalNotification(destinationName);
    } else {
      await FallbackNavigationNotificationService.showArrivalNotification(destinationName);
    }
  }

  // Vérifier si les notifications sont actives
  static isActive(): boolean {
    if (this.useExpoNotifications) {
      return NavigationNotificationService.isActive();
    } else {
      return FallbackNavigationNotificationService.isActive();
    }
  }

  // Demander les permissions
  static async requestPermissions(): Promise<boolean> {
    await this.initialize();
    
    if (this.useExpoNotifications) {
      return await NavigationNotificationService.requestPermissions();
    } else {
      return await FallbackNavigationNotificationService.requestPermissions();
    }
  }

  // Nettoyer toutes les notifications
  static async clearAllNotifications(): Promise<void> {
    if (this.useExpoNotifications) {
      await NavigationNotificationService.clearAllNotifications();
    } else {
      await FallbackNavigationNotificationService.clearAllNotifications();
    }
  }

  // Obtenir le type de service utilisé
  static getServiceType(): 'expo' | 'fallback' {
    return this.useExpoNotifications ? 'expo' : 'fallback';
  }
}

// Réexporter les types
export { NavigationStep, NavigationProgress };

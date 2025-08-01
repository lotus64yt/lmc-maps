import { Alert, Vibration } from 'react-native';

export interface NavigationStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: string;
  streetName?: string;
}

export interface NavigationProgress {
  currentStepIndex: number;
  totalSteps: number;
  remainingDistance: number;
  totalDistance: number;
  remainingTime: number;
  totalTime: number;
  progressPercentage: number;
}

export class FallbackNavigationNotificationService {
  private static isNavigationActive = false;
  private static lastNotificationTime = 0;

  // Démarrer les notifications de navigation
  static async startNavigationNotifications(): Promise<void> {
    this.isNavigationActive = true;
    console.log('Navigation notifications started (fallback mode)');
  }

  // Arrêter les notifications de navigation
  static async stopNavigationNotifications(): Promise<void> {
    this.isNavigationActive = false;
    console.log('Navigation notifications stopped (fallback mode)');
  }

  // Afficher une alerte de navigation
  static async showNavigationNotification(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): Promise<void> {
    if (!this.isNavigationActive) return;

    // Limiter les alertes pour éviter le spam (une toutes les 30 secondes max)
    const now = Date.now();
    if (now - this.lastNotificationTime < 30000) {
      return;
    }
    this.lastNotificationTime = now;

    // Formater la distance
    const formatDistance = (meters: number): string => {
      if (meters < 1000) {
        return `${Math.round(meters)}m`;
      } else {
        return `${(meters / 1000).toFixed(1)}km`;
      }
    };

    // Formater le temps
    const formatTime = (seconds: number): string => {
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) {
        return `${minutes}min`;
      } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}min` : ''}`;
      }
    };

    const title = `Navigation - Dans ${formatDistance(currentStep.distance)}`;
    let message = currentStep.instruction;
    if (currentStep.streetName) {
      message += ` sur ${currentStep.streetName}`;
    }
    message += `\n\nRestant: ${formatDistance(progress.remainingDistance)} • ${formatTime(progress.remainingTime)}`;
    message += `\nProgression: ${progress.progressPercentage.toFixed(0)}%`;

    // Vibration pour attirer l'attention
    Vibration.vibrate([100, 50, 100]);

    Alert.alert(title, message, [{ text: 'OK', style: 'default' }]);
  }

  // Afficher une alerte d'arrivée
  static async showArrivalNotification(destinationName: string): Promise<void> {
    if (!this.isNavigationActive) return;

    Vibration.vibrate([200, 100, 200, 100, 200]);

    Alert.alert(
      '🏁 Destination atteinte !',
      `Vous êtes arrivé à ${destinationName}`,
      [{ text: 'OK', style: 'default' }]
    );

    // Arrêter les notifications après l'arrivée
    setTimeout(() => {
      this.stopNavigationNotifications();
    }, 1000);
  }

  // Vérifier si les notifications sont actives
  static isActive(): boolean {
    return this.isNavigationActive;
  }

  // Demander les permissions (pas nécessaire pour les alertes)
  static async requestPermissions(): Promise<boolean> {
    return true;
  }

  // Nettoyer (pas nécessaire pour les alertes)
  static async clearAllNotifications(): Promise<void> {
    // Rien à faire pour les alertes
  }
}

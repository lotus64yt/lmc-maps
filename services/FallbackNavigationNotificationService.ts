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

  static async startNavigationNotifications(): Promise<void> {
    this.isNavigationActive = true;
  }

  static async stopNavigationNotifications(): Promise<void> {
    this.isNavigationActive = false;
  }

  static async showNavigationNotification(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): Promise<void> {
    if (!this.isNavigationActive) return;

    const now = Date.now();
    if (now - this.lastNotificationTime < 30000) {
      return;
    }
    this.lastNotificationTime = now;

    const formatDistance = (meters: number): string => {
      if (meters < 1000) {
        return `${Math.round(meters)}m`;
      } else {
        return `${(meters / 1000).toFixed(1)}km`;
      }
    };

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

    Vibration.vibrate([100, 50, 100]);

    Alert.alert(title, message, [{ text: 'OK', style: 'default' }]);
  }

  static async showArrivalNotification(destinationName: string): Promise<void> {
    if (!this.isNavigationActive) return;

    Vibration.vibrate([200, 100, 200, 100, 200]);

    Alert.alert(
      '🏁 Destination atteinte !',
      `Vous êtes arrivé à ${destinationName}`,
      [{ text: 'OK', style: 'default' }]
    );

    setTimeout(() => {
      this.stopNavigationNotifications();
    }, 1000);
  }

  static isActive(): boolean {
    return this.isNavigationActive;
  }

  static async requestPermissions(): Promise<boolean> {
    return true;
  }

  static async clearAllNotifications(): Promise<void> {
  }
}


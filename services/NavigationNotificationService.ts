import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // Pas d'alerte pour les mises à jour
    shouldPlaySound: false, // Pas de son pour les mises à jour
    shouldSetBadge: false,
  }),
});

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

export class NavigationNotificationService {
  private static notificationId: string | null = null;
  private static isNavigationActive = false;
  private static lastNotificationContent: string | null = null;
  private static updateThrottleTimeout: NodeJS.Timeout | null = null;
  private static pendingUpdate: boolean = false;
  
  // Seuils pour décider quand mettre à jour la notification
  private static readonly UPDATE_THRESHOLDS = {
    DISTANCE_CHANGE: 50, // Mettre à jour si la distance change de plus de 50m
    TIME_INTERVAL: 10000, // Mettre à jour au maximum toutes les 10 secondes
    STEP_CHANGE: true, // Toujours mettre à jour lors d'un changement d'étape
    SIGNIFICANT_PROGRESS: 5, // Mettre à jour si le pourcentage de progression change de plus de 5%
  };

  private static lastUpdateData = {
    distance: 0,
    stepIndex: -1,
    progressPercentage: 0,
    lastUpdateTime: 0,
  };

  // Demander les permissions de notification
  static async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Permissions de notification refusées');
        return false;
      }

      // Configuration pour Android
      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('navigation', {
            name: 'Navigation',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#007AFF',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: true,
            description: 'Notifications pour les instructions de navigation',
            enableLights: true,
            enableVibrate: true,
          });
        } catch (channelError) {
          console.log('Erreur lors de la création du canal de notification:', channelError);
        }
      } 

      return true;
    } catch (error) {
      console.log('Erreur lors de la demande de permissions de notification:', error);
      return false;
    }
  }

  // Démarrer les notifications de navigation
  static async startNavigationNotifications(): Promise<void> {
    this.isNavigationActive = true;
    this.lastNotificationContent = null;
    this.lastUpdateData = {
      distance: 0,
      stepIndex: -1,
      progressPercentage: 0,
      lastUpdateTime: 0,
    };
    console.log('Notifications de navigation démarrées');
  }

  // Arrêter les notifications de navigation
  static async stopNavigationNotifications(): Promise<void> {
    this.isNavigationActive = false;
    
    // Annuler le throttling en cours
    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout);
      this.updateThrottleTimeout = null;
    }
    
    try {
      if (this.notificationId) {
        await Notifications.dismissNotificationAsync(this.notificationId);
        this.notificationId = null;
      }
    } catch (error) {
      console.log('Erreur lors de l\'arrêt des notifications:', error);
    }
    
    this.lastNotificationContent = null;
    console.log('Notifications de navigation arrêtées');
  }

  // Vérifier si une mise à jour est nécessaire
  private static shouldUpdateNotification(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): boolean {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateData.lastUpdateTime;

    // Toujours mettre à jour lors du changement d'étape
    if (progress.currentStepIndex !== this.lastUpdateData.stepIndex) {
      console.log('🔔 Mise à jour nécessaire: changement d\'étape');
      return true;
    }

    // Mettre à jour si la distance change significativement
    const distanceChange = Math.abs(currentStep.distance - this.lastUpdateData.distance);
    if (distanceChange >= this.UPDATE_THRESHOLDS.DISTANCE_CHANGE) {
      console.log('🔔 Mise à jour nécessaire: changement de distance significatif');
      return true;
    }

    // Mettre à jour si le pourcentage de progression change significativement
    const progressChange = Math.abs(progress.progressPercentage - this.lastUpdateData.progressPercentage);
    if (progressChange >= this.UPDATE_THRESHOLDS.SIGNIFICANT_PROGRESS) {
      console.log('🔔 Mise à jour nécessaire: changement de progression significatif');
      return true;
    }

    // Mettre à jour périodiquement (mais pas trop souvent)
    if (timeSinceLastUpdate >= this.UPDATE_THRESHOLDS.TIME_INTERVAL) {
      console.log('🔔 Mise à jour nécessaire: intervalle de temps atteint');
      return true;
    }

    return false;
  }

  // Afficher/mettre à jour la notification de navigation avec throttling
  static async showNavigationNotification(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): Promise<void> {
    if (!this.isNavigationActive) return;

    // Vérifier si une mise à jour est nécessaire
    if (!this.shouldUpdateNotification(currentStep, progress)) {
      return;
    }

    // Si une mise à jour est déjà en cours, marquer qu'une autre est nécessaire
    if (this.updateThrottleTimeout) {
      this.pendingUpdate = true;
      return;
    }

    // Effectuer la mise à jour immédiatement
    await this.performNotificationUpdate(currentStep, progress);

    // Programmer le prochain check avec throttling
    this.updateThrottleTimeout = setTimeout(() => {
      this.updateThrottleTimeout = null;
      
      // Si une mise à jour est en attente, l'effectuer maintenant
      if (this.pendingUpdate) {
        this.pendingUpdate = false;
        this.showNavigationNotification(currentStep, progress);
      }
    }, 2000); // Minimum 2 secondes entre les mises à jour
  }

  // Effectuer la mise à jour réelle de la notification
  private static async performNotificationUpdate(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): Promise<void> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      const notificationContent = this.createNotificationContent(currentStep, progress);
      
      // Ne pas mettre à jour si le contenu n'a pas changé
      if (notificationContent.fullBody === this.lastNotificationContent) {
        return;
      }

      // Détermine si c'est la première notification ou une mise à jour
      const isNewStep = progress.currentStepIndex !== this.lastUpdateData.stepIndex;
      const shouldPlaySound = isNewStep && this.notificationId !== null; // Son uniquement pour nouveau step, pas pour la première

      // Configuration de la notification
      const notificationConfig = {
        content: {
          title: notificationContent.title,
          body: notificationContent.fullBody,
          data: {
            type: 'navigation',
            step: currentStep,
            progress,
            updateTime: Date.now(),
          },
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sticky: true,
          categoryIdentifier: 'navigation',
          sound: shouldPlaySound ? 'default' : false,
          ...(Platform.OS === 'android' && {
            channelId: 'navigation',
          }),
        },
        trigger: null,
      };

      // Si une notification existe déjà, la remplacer silencieusement
      if (this.notificationId) {
        // Mettre à jour la notification existante
        this.notificationId = await Notifications.scheduleNotificationAsync(notificationConfig);
      } else {
        // Créer la première notification (avec son si configuré)
        notificationConfig.content.sound = 'default';
        this.notificationId = await Notifications.scheduleNotificationAsync(notificationConfig);
      }

      // Mettre à jour les données de référence
      this.lastNotificationContent = notificationContent.fullBody;
      this.lastUpdateData = {
        distance: currentStep.distance,
        stepIndex: progress.currentStepIndex,
        progressPercentage: progress.progressPercentage,
        lastUpdateTime: Date.now(),
      };

      console.log('🔔 Notification mise à jour', { 
        stepIndex: progress.currentStepIndex, 
        distance: currentStep.distance,
        isNewStep 
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour de la notification:', error);
    }
  }

  // Créer le contenu de la notification
  private static createNotificationContent(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): { title: string; fullBody: string } {
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

    // Obtenir l'emoji pour le type de manœuvre
    const getManeuverEmoji = (maneuver: string): string => {
      const emojiMap: Record<string, string> = {
        'turn-left': '↰',
        'turn-slight-left': '↖',
        'turn-right': '↱',
        'turn-slight-right': '↗',
        'turn-sharp-left': '↺',
        'turn-sharp-right': '↻',
        'straight': '↑',
        'continue': '↑',
        'uturn': '↶',
        'roundabout-left': '🔄',
        'roundabout-right': '🔄',
        'merge': '🔀',
        'fork-left': '🔱',
        'fork-right': '🔱',
        'arrive': '🏁',
        'destination': '🏁',
        'ferry': '⛴️',
        'ramp': '🛣️',
      };
      
      return emojiMap[maneuver.toLowerCase()] || '🧭';
    };

    // Créer le titre avec emoji de manœuvre
    const title = `${getManeuverEmoji(currentStep.maneuver)} Dans ${formatDistance(currentStep.distance)}`;
    
    // Créer le corps de la notification
    let body = currentStep.instruction;
    if (currentStep.streetName) {
      body += ` sur ${currentStep.streetName}`;
    }
    
    // Ajouter les infos de progression
    const progressText = `📍 ${formatDistance(progress.remainingDistance)} • ⏱️ ${formatTime(progress.remainingTime)} restant`;

    // Créer une barre de progression compacte
    const progressBarLength = 15;
    const filledLength = Math.round((progress.progressPercentage / 100) * progressBarLength);
    const emptyLength = progressBarLength - filledLength;
    const progressBar = '▓'.repeat(filledLength) + '░'.repeat(emptyLength);

    // Ajouter l'information d'étape
    const stepInfo = `📋 Étape ${progress.currentStepIndex + 1}/${progress.totalSteps}`;

    const fullBody = `${body}\n\n${progressText}\n${stepInfo}\n${progressBar} ${progress.progressPercentage.toFixed(0)}%`;

    return { title, fullBody };
  }

  // Afficher une notification d'arrivée (avec son)
  static async showArrivalNotification(destinationName: string): Promise<void> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      // Supprimer la notification de navigation active
      if (this.notificationId) {
        await Notifications.dismissNotificationAsync(this.notificationId);
        this.notificationId = null;
      }

      // Afficher la notification d'arrivée avec son
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🏁 Destination atteinte !',
          body: `Vous êtes arrivé à ${destinationName}`,
          data: {
            type: 'arrival',
            destination: destinationName,
          },
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sound: 'default',
          sticky: false,
          ...(Platform.OS === 'android' && {
            channelId: 'navigation',
          }),
        },
        trigger: null,
      });

      // Arrêter les notifications de navigation après l'arrivée
      setTimeout(() => {
        this.stopNavigationNotifications();
      }, 5000);

    } catch (error) {
      console.error('Erreur lors de l\'affichage de la notification d\'arrivée:', error);
    }
  }

  // Forcer une mise à jour immédiate (utile pour les changements d'étape importants)
  static async forceUpdateNotification(
    currentStep: NavigationStep,
    progress: NavigationProgress
  ): Promise<void> {
    if (!this.isNavigationActive) return;

    // Annuler le throttling en cours
    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout);
      this.updateThrottleTimeout = null;
    }

    this.pendingUpdate = false;
    await this.performNotificationUpdate(currentStep, progress);
  }

  // Vérifier si les notifications sont actives
  static isActive(): boolean {
    return this.isNavigationActive;
  }

  // Nettoyer toutes les notifications
  static async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
      this.notificationId = null;
      this.lastNotificationContent = null;
      
      if (this.updateThrottleTimeout) {
        clearTimeout(this.updateThrottleTimeout);
        this.updateThrottleTimeout = null;
      }
      
    } catch (error) {
      console.log('Erreur lors du nettoyage des notifications:', error);
    }
  }

  // Obtenir des statistiques sur les mises à jour
  static getUpdateStats(): {
    lastUpdateTime: number;
    currentStepIndex: number;
    hasActiveNotification: boolean;
  } {
    return {
      lastUpdateTime: this.lastUpdateData.lastUpdateTime,
      currentStepIndex: this.lastUpdateData.stepIndex,
      hasActiveNotification: this.notificationId !== null,
    };
  }
}
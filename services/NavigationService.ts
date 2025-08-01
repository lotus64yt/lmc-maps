import * as Location from 'expo-location';
import { Vibration } from 'react-native';
import { NavigationState, NavigationStep } from '../types/RouteTypes';
import { Coordinate } from './RouteService';
import { HybridNavigationNotificationService, NavigationProgress } from './HybridNavigationNotificationService';
import { NavigationInstructionService } from './NavigationInstructionService';
import { LastTripStorage, LastTripData } from './LastTripStorage';

class NavigationService {
  private lastNotificationTime: number = 0;
  private navigationState: NavigationState = {
    isNavigating: false,
    currentStepIndex: 0,
    steps: [],
    remainingDistance: 0,
    remainingDuration: 0,
    nextStep: undefined,
    distanceToNextStep: 0,
    currentLocation: null,
  };

  private locationSubscription: Location.LocationSubscription | null = null;
  private listeners: ((state: NavigationState) => void)[] = [];
  private routeService: any = null; // Référence au service de route
  private currentMode: string = 'driving';
  private lastRouteCheck: number = 0; // Timestamp du dernier check de route
  private routeCoordinates: number[] = []; // Coordonnées complètes de la route
  private lastTripDestination: { latitude: number; longitude: number; name?: string } | null = null;

  // Démarrer la navigation avec les étapes de route
  async startNavigation(routeSteps: NavigationStep[], routeService?: any, mode: string = 'driving', fullRouteCoordinates?: number[], destinationInfo?: { latitude: number; longitude: number; name?: string }) {
    // Vibration pour confirmer le début de navigation
    Vibration.vibrate(150);
    
    this.routeService = routeService;
    this.currentMode = mode;
    this.routeCoordinates = fullRouteCoordinates || [];
    this.lastTripDestination = destinationInfo || null;

    // Sauvegarder le trajet en cours
    if (routeSteps.length > 0 && destinationInfo) {
      await LastTripStorage.save({
        destination: destinationInfo,
        mode,
        routeSteps,
        fullRouteCoordinates: fullRouteCoordinates || [],
      });
    }

    this.navigationState = {
      ...this.navigationState,
      isNavigating: true,
      currentStepIndex: 0,
      steps: routeSteps,
      remainingDistance: this.calculateTotalDistance(routeSteps),
      remainingDuration: this.calculateTotalDuration(routeSteps),
      nextStep: routeSteps[0],
      distanceToNextStep: routeSteps[0]?.distance || 0,
    };

    // Démarrer les notifications de navigation
    await HybridNavigationNotificationService.startNavigationNotifications();
    
    // Afficher la première notification si on a une étape
    if (routeSteps.length > 0) {
      this.updateNavigationNotification();
    }

    this.startLocationTracking();
    this.notifyListeners();
  }

  // Arrêter la navigation
  async stopNavigation() {
    // Arrêter les notifications de navigation
    await HybridNavigationNotificationService.stopNavigationNotifications();
    
    // Supprimer le trajet sauvegardé (trajet terminé ou annulé)
    await LastTripStorage.clear();
    this.navigationState = {
      ...this.navigationState,
      isNavigating: false,
      currentStepIndex: 0,
      steps: [],
      remainingDistance: 0,
      remainingDuration: 0,
      nextStep: undefined,
      distanceToNextStep: 0,
    };

    this.stopLocationTracking();
    this.notifyListeners();
  }

  // Démarrer le suivi de position
  private async startLocationTracking() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('Permission de localisation refusée');
        return;
      }

      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000, // Mise à jour chaque seconde
          distanceInterval: 5, // Ou tous les 5 mètres
        },
        (location) => {
          this.updateCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      );
    } catch (error) {
      console.error('Erreur lors du démarrage du suivi GPS:', error);
    }
  }

  // Arrêter le suivi de position
  private stopLocationTracking() {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
  }

  // Mettre à jour la position actuelle et recalculer la navigation
  private async updateCurrentLocation(location: { latitude: number; longitude: number }) {
    this.navigationState.currentLocation = location;

    if (this.navigationState.isNavigating && this.navigationState.nextStep) {
      // Détecter si l'utilisateur a avancé dans l'itinéraire
      const closestStepIndex = NavigationInstructionService.findClosestStep(location, this.navigationState.steps);
      
      // Si l'utilisateur est plus proche d'une étape plus avancée, passer à cette étape
      if (closestStepIndex > this.navigationState.currentStepIndex) {
        console.log(`🚀 User skipped to step ${closestStepIndex}`);
        this.navigationState.currentStepIndex = closestStepIndex;
        this.navigationState.nextStep = this.navigationState.steps[closestStepIndex];
        this.navigationState.distanceToNextStep = this.navigationState.nextStep?.distance || 0;
        
        // Vibration pour indiquer le saut d'étapes
        Vibration.vibrate([100, 50, 100, 50, 100]);
      }

      // Vérifier si on a quitté la route (tous les 10 secondes pour éviter trop de requêtes)
      const now = Date.now();
      if (this.routeService && now - this.lastRouteCheck > 10000) {
        this.lastRouteCheck = now;
        const needsRecalculation = await this.routeService.recalculateIfOffRoute(
          { latitude: location.latitude, longitude: location.longitude },
          this.currentMode
        );
        if (needsRecalculation) {
          // Vibration pour indiquer que la route a été recalculée
          Vibration.vibrate([50, 50, 50]); // Triple vibration courte pour recalcul
          console.log('🔄 Route recalculated due to deviation');
          
          // IMPORTANT: Récupérer les nouvelles données de route directement depuis l'API
          if (this.lastTripDestination) {
            try {
              // Recalculer la route depuis la position actuelle vers la destination
              const routeCalculated = await this.routeService.getHybridRoute(
                { latitude: location.latitude, longitude: location.longitude },
                this.lastTripDestination,
                this.currentMode
              );
              
              if (routeCalculated) {
                console.log('🔄 Route successfully recalculated from API');
                
                // Les nouvelles coordonnées sont automatiquement mises à jour dans routeService
                // Maintenant on a besoin de récupérer les nouvelles étapes depuis l'API OSRM
                const newSteps = await this.fetchNavigationStepsFromAPI(
                  { latitude: location.latitude, longitude: location.longitude },
                  this.lastTripDestination,
                  this.currentMode
                );
                
                if (newSteps && newSteps.length > 0) {
                  console.log(`🔄 Updated navigation steps from API: ${newSteps.length} steps`);
                  
                  // Mettre à jour les étapes de navigation
                  this.navigationState.steps = newSteps;
                  this.navigationState.currentStepIndex = 0; // Repartir de la première étape
                  this.navigationState.nextStep = newSteps[0];
                  this.navigationState.distanceToNextStep = newSteps[0]?.distance || 0;
                  this.navigationState.remainingDistance = this.calculateTotalDistance(newSteps);
                  this.navigationState.remainingDuration = this.calculateTotalDuration(newSteps);
                  this.routeCoordinates = this.routeService.routeCoords?.map((coord: any) => [coord.longitude, coord.latitude]).flat() || [];
                  
                  // Sauvegarder la nouvelle route dans le storage
                  await LastTripStorage.save({
                    destination: this.lastTripDestination,
                    mode: this.currentMode,
                    routeSteps: newSteps,
                    fullRouteCoordinates: this.routeCoordinates,
                  });
                } else {
                  console.warn('🔄 Failed to get navigation steps from API after recalculation');
                }
              }
            } catch (error) {
              console.error('🔄 Error during route recalculation:', error);
            }
          }
          
          // Notification immédiate (pas de throttle)
          this.updateNavigationNotification(false);
          this.lastNotificationTime = Date.now();
          this.notifyListeners();
          return;
        }
      }
      
      // Calculer la distance à la prochaine étape
      const distanceToNext = this.calculateDistance(
        location.latitude,
        location.longitude,
        this.navigationState.nextStep.coordinates[1],
        this.navigationState.nextStep.coordinates[0]
      );

      this.navigationState.distanceToNextStep = distanceToNext;

      // Vérifier si on doit passer à l'étape suivante (dans un rayon de 30m)
      if (distanceToNext < 30 && this.navigationState.currentStepIndex < this.navigationState.steps.length - 1) {
        this.advanceToNextStep();
      }

      // Recalculer les distances et temps restants
      this.updateRemainingStats();
      
      // Throttle la notification système : max 1 toutes les 15s sauf changement d'étape ou recalcul
      if (Date.now() - this.lastNotificationTime > 15000) {
        this.updateNavigationNotification(false); // false = pas de vibration
        this.lastNotificationTime = Date.now();
      }
      this.notifyListeners();
    }
  }

  // Mettre à jour la notification de navigation
  // vibrate = true par défaut, mais on peut désactiver pour les updates fréquentes
  private async updateNavigationNotification(vibrate: boolean = true) {
    if (!this.navigationState.isNavigating || !this.navigationState.nextStep) {
      return;
    }

    try {
      // Déterminer si l'utilisateur est sur la route
      const userOnRoute = this.navigationState.currentLocation 
        ? NavigationInstructionService.isUserOnRoute(this.navigationState.currentLocation, this.routeCoordinates)
        : true;

      // Générer l'instruction personnalisée
      const instruction = NavigationInstructionService.generateInstructionFromStep(
        this.navigationState.nextStep,
        this.navigationState.steps[this.navigationState.currentStepIndex + 1],
        this.navigationState.currentStepIndex === 0,
        userOnRoute
      );

      // Créer l'objet step pour la notification
      const currentStep = {
        instruction: instruction.text,
        distance: this.navigationState.distanceToNextStep,
        duration: this.navigationState.nextStep.duration || 0,
        maneuver: instruction.icon,
        streetName: this.navigationState.nextStep.streetName,
      };

      // Calculer la progression
      const totalDistance = this.calculateTotalDistance(this.navigationState.steps);
      const progressPercentage = totalDistance > 0 
        ? Math.max(0, Math.min(100, ((totalDistance - this.navigationState.remainingDistance) / totalDistance) * 100))
        : 0;

      const progress: NavigationProgress = {
        currentStepIndex: this.navigationState.currentStepIndex,
        totalSteps: this.navigationState.steps.length,
        remainingDistance: this.navigationState.remainingDistance,
        totalDistance: totalDistance,
        remainingTime: this.navigationState.remainingDuration,
        totalTime: this.calculateTotalDuration(this.navigationState.steps),
        progressPercentage: progressPercentage,
      };

      // Afficher la notification
      await HybridNavigationNotificationService.showNavigationNotification(currentStep, progress);

      // Vibrer uniquement si demandé (ex: changement d'étape, recalcul, etc)
      if (vibrate) {
        Vibration.vibrate(50);
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la notification:', error);
    }
  }

  // Passer à l'étape suivante
  private async advanceToNextStep() {
    const nextIndex = this.navigationState.currentStepIndex + 1;
    
    if (nextIndex < this.navigationState.steps.length) {
      // Vibration pour indiquer qu'on passe à l'étape suivante
      Vibration.vibrate([100, 50, 100]); // Double vibration pour intersection/changement de direction
      
      this.navigationState.currentStepIndex = nextIndex;
      this.navigationState.nextStep = this.navigationState.steps[nextIndex];
      this.navigationState.distanceToNextStep = this.navigationState.nextStep?.distance || 0;
      
      // Mettre à jour la notification pour la nouvelle étape (immédiat, pas de throttle)
      this.updateNavigationNotification();
      this.lastNotificationTime = Date.now();
    } else {
      // Vibration pour destination atteinte
      Vibration.vibrate([200, 100, 200, 100, 200]); // Séquence distinctive pour arrivée
      
      // Afficher la notification d'arrivée
      const lastStep = this.navigationState.steps[this.navigationState.steps.length - 1];
      const destinationName = lastStep?.streetName || 'votre destination';
      await HybridNavigationNotificationService.showArrivalNotification(destinationName);
      
      // Navigation terminée
      this.stopNavigation();
    }
  }

  // Mettre à jour les statistiques restantes
  private updateRemainingStats() {
    const remainingSteps = this.navigationState.steps.slice(this.navigationState.currentStepIndex);
    this.navigationState.remainingDistance = this.calculateTotalDistance(remainingSteps) + this.navigationState.distanceToNextStep;
    this.navigationState.remainingDuration = this.calculateTotalDuration(remainingSteps);
  }

  // Calculer la distance totale des étapes
  private calculateTotalDistance(steps: NavigationStep[]): number {
    return steps.reduce((total, step) => total + step.distance, 0);
  }

  // Calculer la durée totale des étapes
  private calculateTotalDuration(steps: NavigationStep[]): number {
    return steps.reduce((total, step) => total + step.duration, 0);
  }

  // Calculer la distance entre deux points (formule haversine)
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  // Récupérer les étapes de navigation directement depuis l'API OSRM
  private async fetchNavigationStepsFromAPI(
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number },
    mode: string
  ): Promise<NavigationStep[]> {
    try {
      const osrmMode = mode === 'bicycling' ? 'bike' : mode === 'walking' ? 'foot' : 'driving';
      const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
      
      console.log('🔄 Fetching navigation steps from OSRM API:', url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        // Utiliser la méthode existante pour convertir les données OSRM
        const steps = this.convertRouteToNavigationSteps(data);
        console.log(`🔄 Successfully fetched ${steps.length} steps from OSRM`);
        return steps;
      } else {
        console.warn('🔄 No routes found in OSRM response');
        return [];
      }
    } catch (error) {
      console.error('🔄 Error fetching navigation steps from OSRM:', error);
      return [];
    }
  }

  // Convertir les données de route en étapes de navigation
  convertRouteToNavigationSteps(routeData: any): NavigationStep[] {
    // Cette fonction doit être adaptée selon le format des données de votre API de routing
    // Exemple avec les données OSRM ou OpenRouteService
    const steps: NavigationStep[] = [];
    
    console.log('🔧 Debug - Conversion des données de route:', routeData);
    
    if (routeData.routes && routeData.routes[0] && routeData.routes[0].legs) {
      routeData.routes[0].legs.forEach((leg: any) => {
        if (leg.steps) {
          leg.steps.forEach((step: any, index: number) => {
            const navigationStep = {
              instruction: step.maneuver?.instruction || `Continuer sur ${step.name || 'la route'}`,
              distance: step.distance || 0,
              duration: step.duration || 0,
              maneuver: step.maneuver?.type || 'straight',
              coordinates: step.maneuver?.location || [0, 0],
              direction: this.getDirection(step.maneuver?.bearing_after),
              streetName: step.name || '',
              // Ajouter les données OSRM complètes pour une meilleure analyse
              osrmModifier: step.maneuver?.modifier,
              osrmInstruction: step.maneuver?.instruction,
              bearingBefore: step.maneuver?.bearing_before,
              bearingAfter: step.maneuver?.bearing_after,
            };
            
            steps.push(navigationStep);
          });
        }
      });
    }

    return steps;
  }

  // Convertir l'angle en direction
  private getDirection(bearing?: number): string {
    if (bearing === undefined) return '';
    
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  // Obtenir le maneuver icon
  getManeuverIcon(maneuver: string): string {
    const icons: { [key: string]: string } = {
      'turn-straight': 'straight',
      'turn-slight-right': 'turn-slight-right',
      'turn-right': 'turn-right',
      'turn-sharp-right': 'turn-sharp-right',
      'turn-slight-left': 'turn-slight-left',
      'turn-left': 'turn-left',
      'turn-sharp-left': 'turn-sharp-left',
      'uturn': 'u-turn-right',
      'arrive': 'flag',
      'depart': 'play-arrow',
      'merge': 'merge-type',
      'on-ramp': 'ramp-right',
      'off-ramp': 'ramp-left',
      'roundabout': 'roundabout-right',
    };

    return icons[maneuver] || 'straight';
  }

  // Écouter les changements d'état
  addListener(callback: (state: NavigationState) => void) {
    this.listeners.push(callback);
  }

  // Supprimer un listener
  removeListener(callback: (state: NavigationState) => void) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  // Notifier tous les listeners
  private notifyListeners() {
    this.listeners.forEach(listener => listener({ ...this.navigationState }));
  }

  // Obtenir l'état actuel
  getCurrentState(): NavigationState {
    return { ...this.navigationState };
  }
}

export default new NavigationService();

import * as Location from "expo-location";
import { Vibration } from "react-native";
import { NavigationState, NavigationStep } from "../types/RouteTypes";
import { NavigationInstructionService } from "./NavigationInstructionService";
import { LastTripStorage, LastTripData } from "./LastTripStorage";

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
    completedRouteCoordinates: [],
    remainingRouteCoordinates: [],
    progressPercentage: 0,
    hasStartedMoving: false,
  };

  private locationSubscription: Location.LocationSubscription | null = null;
  private listeners: ((state: NavigationState) => void)[] = [];
  private routeService: any = null; // Référence au service de route
  private currentMode: string = "driving";
  private lastRouteCheck: number = 0; // Timestamp du dernier check de route
  private routeCoordinates: number[] = []; // Coordonnées complètes de la route
  private lastTripDestination: {
    latitude: number;
    longitude: number;
    name?: string;
  } | null = null;
  private initialLocation: { latitude: number; longitude: number } | null =
    null; // Position de départ
  private movementThreshold: number = 20; // Distance minimale pour considérer qu'on a commencé à bouger (mètres)

  // Nouveau système pour éviter les changements d'étapes trop fréquents
  private lastStepChangeTime: number = 0;
  private stepChangeMinInterval: number = 3000; // 3 secondes minimum entre changements d'étapes
  private stepToleranceDistance: number = 50; // 50 mètres de tolérance pour éviter les oscillations

  // Démarrer la navigation avec les étapes de route
  async startNavigation(
    routeSteps: NavigationStep[],
    routeService?: any,
    mode: string = "driving",
    fullRouteCoordinates?: number[],
    destinationInfo?: { latitude: number; longitude: number; name?: string }
  ) {
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

    // Obtenir la position actuelle pour établir le point de départ
    let currentLocation: { latitude: number; longitude: number } | null = null;
    let initialStepIndex = 0;

    try {
      const locationResult = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      currentLocation = {
        latitude: locationResult.coords.latitude,
        longitude: locationResult.coords.longitude,
      };
      this.initialLocation = currentLocation;

      // 🚀 AMÉLIORATION : Détecter immédiatement la bonne étape de départ
      // Si l'utilisateur est déjà en mouvement, trouver l'étape la plus proche
      if (routeSteps.length > 0) {
        const closestStepIndex = NavigationInstructionService.findClosestStep(
          currentLocation,
          routeSteps
        );

        // Si on détecte qu'on est plus proche d'une étape suivante, démarrer depuis cette étape
        if (closestStepIndex > 0) {
          // Vérifier si on est vraiment passé la première étape (pas juste à côté)
          const distanceToFirst = this.calculateDistanceToStep(
            currentLocation,
            routeSteps[0]
          );
          const distanceToClosest = this.calculateDistanceToStep(
            currentLocation,
            routeSteps[closestStepIndex]
          );

          // Si on est significativement plus proche de l'étape trouvée ET qu'on a probablement dépassé la première
          if (
            distanceToClosest < distanceToFirst - 100 &&
            distanceToFirst > 150
          ) {
            initialStepIndex = closestStepIndex;
          }
        }
      }
    } catch (error) {
      console.warn("Impossible d'obtenir la position de départ:", error);
    }

    this.navigationState = {
      ...this.navigationState,
      isNavigating: true,
      currentStepIndex: initialStepIndex, // Utiliser l'étape détectée au lieu de 0
      steps: routeSteps,
      remainingDistance: this.calculateTotalDistance(routeSteps),
      remainingDuration: this.calculateTotalDuration(routeSteps),
      nextStep: routeSteps[initialStepIndex], // Commencer à la bonne étape
      distanceToNextStep: routeSteps[initialStepIndex]?.distance || 0,
      currentLocation: currentLocation,
      completedRouteCoordinates: [],
      remainingRouteCoordinates: this.convertRouteCoordinatesToPairs(
        fullRouteCoordinates || []
      ),
      progressPercentage: 0,
      hasStartedMoving: initialStepIndex > 0, // Si on démarre plus loin, on a déjà bougé
    };

    this.startLocationTracking();
    this.notifyListeners();
  }

  // Arrêter la navigation
  async stopNavigation() {
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
      completedRouteCoordinates: [],
      remainingRouteCoordinates: [],
      progressPercentage: 0,
      hasStartedMoving: false,
    };

    // Réinitialiser les variables internes
    this.initialLocation = null;

    this.stopLocationTracking();
    this.notifyListeners();
  }

  // Démarrer le suivi de position
  private async startLocationTracking() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.error("Permission de localisation refusée");
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
      console.error("Erreur lors du démarrage du suivi GPS:", error);
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
  private async updateCurrentLocation(location: {
    latitude: number;
    longitude: number;
  }) {
    this.navigationState.currentLocation = location;

    if (this.navigationState.isNavigating && this.navigationState.nextStep) {
      // Vérifier si l'utilisateur a commencé à bouger (pour éviter les faux sauts d'étapes)
      if (!this.navigationState.hasStartedMoving && this.initialLocation) {
        const distanceFromStart = this.calculateDistance(
          this.initialLocation.latitude,
          this.initialLocation.longitude,
          location.latitude,
          location.longitude
        );

        if (distanceFromStart > this.movementThreshold) {
          this.navigationState.hasStartedMoving = true;
        }
      }

      // Mettre à jour la progression de la route
      this.updateRouteProgress(location);

      // Détecter si l'utilisateur a avancé dans l'itinéraire (seulement s'il a commencé à bouger)
      if (this.navigationState.hasStartedMoving) {
        const closestStepIndex = NavigationInstructionService.findClosestStep(
          location,
          this.navigationState.steps
        );
        const now = Date.now();

        // Si l'utilisateur est plus proche d'une étape différente (en avant ou en arrière), passer à cette étape
        if (
          closestStepIndex !== this.navigationState.currentStepIndex &&
          closestStepIndex >= 0
        ) {
          // Calculer la distance actuelle à l'étape suggérée pour éviter les changements trop fréquents
          const currentStep =
            this.navigationState.steps[this.navigationState.currentStepIndex];
          const suggestedStep = this.navigationState.steps[closestStepIndex];

          let shouldChangeStep = false;

          // Vérifier si assez de temps s'est écoulé depuis le dernier changement
          const timeSinceLastChange = now - this.lastStepChangeTime;
          if (timeSinceLastChange >= this.stepChangeMinInterval) {
            // Calculer les distances aux deux étapes pour s'assurer que le changement est justifié
            if (currentStep?.coordinates && suggestedStep?.coordinates) {
              const distanceToCurrentStep = this.calculateDistanceToStep(
                location,
                currentStep
              );
              const distanceToSuggestedStep = this.calculateDistanceToStep(
                location,
                suggestedStep
              );

              // 🚀 AMÉLIORATION : Logique plus intelligente pour éviter les blocages

              // Si on avance (index plus élevé), être moins strict
              if (closestStepIndex > this.navigationState.currentStepIndex) {
                // Pour avancer, vérifier qu'on est vraiment plus proche de la nouvelle étape
                if (
                  distanceToSuggestedStep < distanceToCurrentStep ||
                  distanceToCurrentStep > 200
                ) {
                  shouldChangeStep = true;
                }
              }
              // Si on recule (index plus faible), être plus strict
              else if (
                closestStepIndex < this.navigationState.currentStepIndex
              ) {
                // Pour reculer, vérifier qu'il y a une vraie différence de distance
                if (
                  distanceToSuggestedStep <
                  distanceToCurrentStep - this.stepToleranceDistance * 2
                ) {
                  shouldChangeStep = true;
                }
              }
            } else {
              // Si on n'a pas de coordonnées détaillées, faire le changement prudemment
              // Seulement si on avance ou si on est très loin de l'étape actuelle
              if (closestStepIndex > this.navigationState.currentStepIndex) {
                shouldChangeStep = true;
              }
            }
          }

          if (shouldChangeStep) {
            this.navigationState.currentStepIndex = closestStepIndex;
            this.navigationState.nextStep =
              this.navigationState.steps[closestStepIndex];
            this.navigationState.distanceToNextStep =
              this.navigationState.nextStep?.distance || 0;
            this.lastStepChangeTime = now;

            // Vibration pour indiquer le changement d'étape
            Vibration.vibrate([100, 50, 100, 50, 100]);
          }
        }
      }

      // Vérifier si on a quitté la route (tous les 10 secondes pour éviter trop de requêtes)
      const now = Date.now();
      if (this.routeService && now - this.lastRouteCheck > 10000) {
        this.lastRouteCheck = now;
        const needsRecalculation =
          await this.routeService.recalculateIfOffRoute(
            { latitude: location.latitude, longitude: location.longitude },
            this.currentMode
          );
        if (needsRecalculation) {
          // Vibration pour indiquer que la route a été recalculée
          Vibration.vibrate([50, 50, 50]); // Triple vibration courte pour recalcul
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
                // Les nouvelles coordonnées sont automatiquement mises à jour dans routeService
                // Maintenant on a besoin de récupérer les nouvelles étapes depuis l'API OSRM
                const newSteps = await this.fetchNavigationStepsFromAPI(
                  {
                    latitude: location.latitude,
                    longitude: location.longitude,
                  },
                  this.lastTripDestination,
                  this.currentMode
                );

                if (newSteps && newSteps.length > 0) {
                  // Mettre à jour les étapes de navigation
                  this.navigationState.steps = newSteps;
                  this.navigationState.currentStepIndex = 0; // Repartir de la première étape
                  this.navigationState.nextStep = newSteps[0];
                  this.navigationState.distanceToNextStep =
                    newSteps[0]?.distance || 0;
                  this.navigationState.remainingDistance =
                    this.calculateTotalDistance(newSteps);
                  this.navigationState.remainingDuration =
                    this.calculateTotalDuration(newSteps);
                  this.routeCoordinates =
                    this.routeService.routeCoords
                      ?.map((coord: any) => [coord.longitude, coord.latitude])
                      .flat() || [];

                  // Sauvegarder la nouvelle route dans le storage
                  await LastTripStorage.save({
                    destination: this.lastTripDestination,
                    mode: this.currentMode,
                    routeSteps: newSteps,
                    fullRouteCoordinates: this.routeCoordinates,
                  });
                } else {
                  console.warn(
                    "🔄 Failed to get navigation steps from API after recalculation"
                  );
                }
              }
            } catch (error) {
              console.error("🔄 Error during route recalculation:", error);
            }
          }

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
      if (
        distanceToNext < 30 &&
        this.navigationState.currentStepIndex <
          this.navigationState.steps.length - 1
      ) {
        this.advanceToNextStep();
      }

      // Recalculer les distances et temps restants
      this.updateRemainingStats();

      this.notifyListeners();
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
      this.navigationState.distanceToNextStep =
        this.navigationState.nextStep?.distance || 0;

      // Mettre à jour la notification pour la nouvelle étape (immédiat, pas de throttle)
      this.lastNotificationTime = Date.now();
    } else {
      // Vibration pour destination atteinte
      Vibration.vibrate([200, 100, 200, 100, 200]); // Séquence distinctive pour arrivée

      // Navigation terminée
      this.stopNavigation();
    }
  }

  // Mettre à jour les statistiques restantes
  private updateRemainingStats() {
    const remainingSteps = this.navigationState.steps.slice(
      this.navigationState.currentStepIndex
    );
    this.navigationState.remainingDistance =
      this.calculateTotalDistance(remainingSteps) +
      this.navigationState.distanceToNextStep;
    this.navigationState.remainingDuration =
      this.calculateTotalDuration(remainingSteps);
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
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Récupérer les étapes de navigation directement depuis l'API OSRM
  private async fetchNavigationStepsFromAPI(
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number },
    mode: string
  ): Promise<NavigationStep[]> {
    try {
      const osrmMode =
        mode === "bicycling" ? "bike" : mode === "walking" ? "foot" : "driving";
      const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        // Utiliser la méthode existante pour convertir les données OSRM
        const steps = this.convertRouteToNavigationSteps(data);
        return steps;
      } else {
        console.warn("🔄 No routes found in OSRM response");
        return [];
      }
    } catch (error) {
      console.error("🔄 Error fetching navigation steps from OSRM:", error);
      return [];
    }
  }

  // Convertir les données de route en étapes de navigation
  convertRouteToNavigationSteps(routeData: any): NavigationStep[] {
    // Cette fonction doit être adaptée selon le format des données de votre API de routing
    // Exemple avec les données OSRM ou OpenRouteService
    const steps: NavigationStep[] = [];
    if (routeData.routes && routeData.routes[0] && routeData.routes[0].legs) {
      routeData.routes[0].legs.forEach((leg: any) => {
        if (leg.steps) {
          leg.steps.forEach((step: any, index: number) => {
            const navigationStep = {
              instruction:
                step.maneuver?.instruction ||
                `Continuer sur ${step.name || "la route"}`,
              distance: step.distance || 0,
              duration: step.duration || 0,
              maneuver: step.maneuver?.type || "straight",
              coordinates: step.maneuver?.location || [0, 0],
              direction: this.getDirection(step.maneuver?.bearing_after),
              streetName: step.name || "",
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
    if (bearing === undefined) return "";

    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  // Obtenir le maneuver icon
  getManeuverIcon(maneuver: string): string {
    const icons: { [key: string]: string } = {
      "turn-straight": "straight",
      "turn-slight-right": "turn-slight-right",
      "turn-right": "turn-right",
      "turn-sharp-right": "turn-sharp-right",
      "turn-slight-left": "turn-slight-left",
      "turn-left": "turn-left",
      "turn-sharp-left": "turn-sharp-left",
      uturn: "u-turn-right",
      arrive: "flag",
      depart: "play-arrow",
      merge: "merge-type",
      "on-ramp": "ramp-right",
      "off-ramp": "ramp-left",
      roundabout: "roundabout-right",
    };

    return icons[maneuver] || "straight";
  }

  // Convertir les coordonnées de route en paires [longitude, latitude]
  private convertRouteCoordinatesToPairs(
    coordinates: number[]
  ): [number, number][] {
    const pairs: [number, number][] = [];
    for (let i = 0; i < coordinates.length; i += 2) {
      if (i + 1 < coordinates.length) {
        pairs.push([coordinates[i], coordinates[i + 1]]);
      }
    }
    return pairs;
  }

  // Mettre à jour la progression de la route
  private updateRouteProgress(currentLocation: {
    latitude: number;
    longitude: number;
  }) {
    if (
      !this.navigationState.remainingRouteCoordinates ||
      this.navigationState.remainingRouteCoordinates.length === 0
    ) {
      return;
    }

    // Trouver le point le plus proche sur la route
    let closestPointIndex = 0;
    let minDistance = Infinity;

    this.navigationState.remainingRouteCoordinates.forEach((coord, index) => {
      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        coord[1], // latitude
        coord[0] // longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestPointIndex = index;
      }
    });

    // Diviser la route en partie complétée et partie restante
    const allRouteCoords = this.convertRouteCoordinatesToPairs(
      this.routeCoordinates
    );
    const totalPoints = allRouteCoords.length;
    const remainingPoints =
      this.navigationState.remainingRouteCoordinates.length;
    const completedPoints = totalPoints - remainingPoints + closestPointIndex;

    // Mettre à jour les coordonnées de progression
    this.navigationState.completedRouteCoordinates = allRouteCoords.slice(
      0,
      completedPoints
    );
    this.navigationState.remainingRouteCoordinates =
      allRouteCoords.slice(completedPoints);

    // Calculer le pourcentage de progression
    if (totalPoints > 0) {
      this.navigationState.progressPercentage = Math.min(
        100,
        Math.max(0, (completedPoints / totalPoints) * 100)
      );
    }
  }

  // Obtenir les coordonnées de la route complétée (pour l'affichage)
  getCompletedRouteCoordinates(): [number, number][] {
    return this.navigationState.completedRouteCoordinates || [];
  }

  // Obtenir les coordonnées de la route restante (pour l'affichage)
  getRemainingRouteCoordinates(): [number, number][] {
    return this.navigationState.remainingRouteCoordinates || [];
  }

  // Calculer la distance minimale entre l'utilisateur et une étape de navigation
  private calculateDistanceToStep(
    userLocation: { latitude: number; longitude: number },
    step: NavigationStep
  ): number {
    if (!step.coordinates || step.coordinates.length < 2) {
      return Infinity;
    }

    let minDistance = Infinity;

    // Vérifier le point de début
    const stepStart = {
      latitude: step.coordinates[1],
      longitude: step.coordinates[0],
    };

    // Vérifier le point de fin
    const stepEnd = {
      latitude: step.coordinates[step.coordinates.length - 1],
      longitude: step.coordinates[step.coordinates.length - 2],
    };

    const distanceToStart = this.calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      stepStart.latitude,
      stepStart.longitude
    );
    const distanceToEnd = this.calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      stepEnd.latitude,
      stepEnd.longitude
    );

    minDistance = Math.min(distanceToStart, distanceToEnd);

    // Pour les étapes plus longues, vérifier aussi quelques points intermédiaires
    if (step.coordinates.length > 4) {
      const midIndex = Math.floor((step.coordinates.length - 2) / 2);
      const stepMid = {
        latitude: step.coordinates[midIndex + 1],
        longitude: step.coordinates[midIndex],
      };
      const distanceToMid = this.calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        stepMid.latitude,
        stepMid.longitude
      );
      minDistance = Math.min(minDistance, distanceToMid);
    }

    return minDistance;
  }

  // Obtenir le pourcentage de progression
  getProgressPercentage(): number {
    return this.navigationState.progressPercentage || 0;
  }

  // Écouter les changements d'état
  addListener(callback: (state: NavigationState) => void) {
    this.listeners.push(callback);
  }

  // Supprimer un listener
  removeListener(callback: (state: NavigationState) => void) {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }

  // Notifier tous les listeners
  private notifyListeners() {
    this.listeners.forEach((listener) => listener({ ...this.navigationState }));
  }

  // Obtenir l'état actuel
  getCurrentState(): NavigationState {
    return { ...this.navigationState };
  }
}

export default new NavigationService();

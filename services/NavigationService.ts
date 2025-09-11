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
    isOffRoute: false,
    isRecalculating: false,
  };
  private locationSubscription: Location.LocationSubscription | null = null;
  private listeners: ((state: NavigationState) => void)[] = [];
  private routeService: any = null; // Référence au service de route
  private currentMode: string = "driving";
  private lastRouteCheck: number = 0; // Timestamp du dernier check de route
  private offRouteCounter: number = 0; // simple hysteresis counter for off-route detections
  private distanceBuffer: number[] = [];
  private distanceBufferSize: number = 5; // keep last 5 samples (~5s)
  private lastLocationTimestamp: number = 0;
  private lastLocation: { latitude: number; longitude: number } | null = null;
  private routeCoordinates: number[] = []; // Coordonnées complètes de la route
  private lastTripDestination: {
    latitude: number;
    longitude: number;
    name?: string;
  } | null = null;
  private initialLocation: { latitude: number; longitude: number } | null = null; // Position de départ
  private movementThreshold: number = 20; // Distance minimale pour considérer qu'on a commencé à bouger (mètres)
  private lastStepChangeTime: number = 0;
  private stepChangeMinInterval: number = 3000; // 3 secondes minimum entre changements d'étapes
  private stepToleranceDistance: number = 50; // 50 mètres de tolérance pour éviter les oscillations
  private offRouteTolerance: number = 20; // meters to consider off-route (20m threshold)
  private offRouteCheckInterval: number = 5000; // check every 5s (easier debug)
  private offRouteTimer: any = null;
  private maxPassedStepIndex: number = -1; // highest index that has been passed/completed
  private recalcDistanceThreshold: number = 50; // meters: force recalculation when distanceToRoute > this
  private routeServiceDisabledUntil: number = 0;
  private pendingRecalculation: boolean = false;

  // Centralize success handling when a recalculation produced a usable route
  private async finalizeRecalculation(newSteps?: NavigationStep[], newFlatCoords?: number[]) {
    try {
      if (Array.isArray(newSteps) && newSteps.length > 0) {
        this.navigationState.steps = newSteps;
        // try to set current step to first reasonable index
        this.navigationState.currentStepIndex = 0;
        this.navigationState.nextStep = newSteps[0];
        this.navigationState.distanceToNextStep = newSteps[0]?.distance || 0;
        this.navigationState.remainingDistance = this.calculateTotalDistance(newSteps);
        this.navigationState.remainingDuration = this.calculateTotalDuration(newSteps);
      }

      if (Array.isArray(newFlatCoords) && newFlatCoords.length >= 4) {
        this.routeCoordinates = newFlatCoords;
        this.navigationState.completedRouteCoordinates = [];
        this.navigationState.remainingRouteCoordinates = this.convertRouteCoordinatesToPairs(this.routeCoordinates);
        this.navigationState.progressPercentage = 0;
      }

      // Clear off-route indicators, recalculation flag and hysteresis so the UI hides the banner
      this.navigationState.isOffRoute = false;
      this.navigationState.isRecalculating = false;
      this.pendingRecalculation = false;
      this.offRouteCounter = 0;
      this.notifyListeners();
      console.log('✅ Route recalculation completed successfully');
    } catch (e) {
      // ignore finalization errors but ensure flags are sane
      try { this.pendingRecalculation = false; this.offRouteCounter = 0; this.navigationState.isRecalculating = false; } catch (_) {}
    }
  }

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

  // Mark steps before initialStepIndex as already passed
  this.maxPassedStepIndex = initialStepIndex - 1;

    this.startLocationTracking();
  this.startOffRouteTimer();
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
  this.stopOffRouteTimer();
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

  private startOffRouteTimer() {
    try {
      this.stopOffRouteTimer();
      if (!this.navigationState || !this.navigationState.isNavigating) {
        return;
      }
      this.offRouteTimer = setInterval(() => {
        try {
          if (this.navigationState && this.navigationState.currentLocation) {
            this.performOffRouteCheck(this.navigationState.currentLocation).catch(() => {
              console.warn("Error in off-route check");
            });
          }
        } catch (e) {
          // ignore
        }
      }, this.offRouteCheckInterval);
    } catch (e) {
      // ignore
    }
  }

  private isRouteServiceAvailable(): boolean {
    return !!this.routeService && Date.now() > this.routeServiceDisabledUntil;
  }

  private stopOffRouteTimer() {
    try {
      if (this.offRouteTimer) {
        clearInterval(this.offRouteTimer);
        this.offRouteTimer = null;
      }
    } catch (e) {
      // ignore
    }
  }

  // Shared off-route check logic (simplified and balanced)
  private async performOffRouteCheck(location: { latitude: number; longitude: number }): Promise<boolean> {
    const now = Date.now();
    if (!this.navigationState || !this.navigationState.isNavigating) return false;
    if (now - this.lastRouteCheck < this.offRouteCheckInterval) return false;
    this.lastRouteCheck = now;

    // Get a distance-to-route (try routeService, then fallback to local geometry)
    let distanceToRoute = Infinity;
    const routeServiceAvailable = this.isRouteServiceAvailable();
    if (routeServiceAvailable && this.routeService && typeof this.routeService.getDistanceToRoute === 'function') {
      try {
        const d = this.routeService.getDistanceToRoute({ latitude: location.latitude, longitude: location.longitude });
        if (Number.isFinite(d)) distanceToRoute = d;
        else this.routeServiceDisabledUntil = Date.now() + 5000;
      } catch (e) {
        this.routeServiceDisabledUntil = Date.now() + 5000;
      }
    }

    if (!Number.isFinite(distanceToRoute)) {
      // local fallback using cached route coordinates
      try {
        if (this.routeCoordinates && this.routeCoordinates.length >= 4) {
          distanceToRoute = this.computeDistanceToRouteFromFlatCoords(location, this.routeCoordinates);
        }
      } catch (e) {
        distanceToRoute = Infinity;
      }
    }

    // Maintain small median buffer
    this.distanceBuffer.push(distanceToRoute);
    if (this.distanceBuffer.length > this.distanceBufferSize) this.distanceBuffer.shift();
    const sorted = [...this.distanceBuffer].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length ? (sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : Infinity;

    // quick speed estimate
    let speed = 0;
    if (this.lastLocation && this.lastLocationTimestamp) {
      const dt = (now - this.lastLocationTimestamp) / 1000;
      if (dt > 0) {
        const d = this.calculateDistance(this.lastLocation.latitude, this.lastLocation.longitude, location.latitude, location.longitude);
        speed = d / dt;
      }
    }

    const effectiveThreshold = speed < 1 ? this.offRouteTolerance * 1.2 : this.offRouteTolerance;
    let detectHelper = false;
    try {
      if (routeServiceAvailable && typeof this.routeService.detectOffRoute === 'function') {
        detectHelper = !!this.routeService.detectOffRoute({ latitude: location.latitude, longitude: location.longitude }, this.offRouteTolerance);
      }
    } catch (e) {
      detectHelper = false;
    }

    const isCurrentlyOffRoute = median > effectiveThreshold;
    const forceByDistance = Number.isFinite(distanceToRoute) && distanceToRoute > this.recalcDistanceThreshold;
    const finalOffRouteDecision = isCurrentlyOffRoute || detectHelper || forceByDistance;

    try {
      // debug logging removed
    } catch (e) { /* ignore */ }

    if (forceByDistance && !this.navigationState.isOffRoute) {
      this.navigationState.isOffRoute = true;
      this.notifyListeners();
    }

    if (!finalOffRouteDecision) return false;

    // Determine where to start recalculation (try routeService, else local projection)
    let recalculationStart: { latitude: number; longitude: number } | false = false;
    if (routeServiceAvailable && this.routeService && typeof this.routeService.recalculateIfOffRoute === 'function') {
      try {
        const res = await this.routeService.recalculateIfOffRoute({ latitude: location.latitude, longitude: location.longitude }, this.currentMode);
        if (res) recalculationStart = res as any;
      } catch (e) {
        recalculationStart = false;
      }
    }

    if (!recalculationStart && forceByDistance) {
      try {
        const proj = this.computeClosestPointOnFlatCoords(location, this.routeCoordinates);
        if (proj) recalculationStart = proj;
      } catch (e) {
        // ignore
      }
    }

    // Show off-route badge and mark pending recalculation
    this.navigationState.isOffRoute = true;
    this.pendingRecalculation = true;
    // Signal that we are starting recalculation (for UI feedback)
    this.navigationState.isRecalculating = true;
    this.notifyListeners();

    // Immediate recalculation: start now when banner appears (avoid waiting for hysteresis)
    // If we have a recalculation start point and a destination, attempt recalculation immediately.
    if (recalculationStart && this.lastTripDestination) {
      // guard double attempts
      if (!this.pendingRecalculation) {
        this.pendingRecalculation = true;
        this.navigationState.isRecalculating = true;
      }

      (async () => {
        try {
          Vibration.vibrate([50, 50, 50]);
          console.log('🔄 Starting immediate route recalculation...');
          const fetchResult = await this.fetchNavigationStepsFromAPI(recalculationStart as { latitude: number; longitude: number }, this.lastTripDestination, this.currentMode);
          const newSteps = fetchResult?.steps || [];
          if (newSteps && newSteps.length > 0) {
            console.log(`🔄 Recalculation successful: ${newSteps.length} new steps`);
            if (Array.isArray(fetchResult.flatCoords) && fetchResult.flatCoords.length >= 4) {
              this.routeCoordinates = fetchResult.flatCoords;
            } else {
              const flatFromService = (this.routeService && (this.routeService.routeCoords?.map((c: any) => [c.longitude, c.latitude]).flat())) || undefined;
              this.routeCoordinates = flatFromService || this.routeCoordinates;
            }

            await LastTripStorage.save({ destination: this.lastTripDestination, mode: this.currentMode, routeSteps: newSteps, fullRouteCoordinates: this.routeCoordinates });
            await this.finalizeRecalculation(newSteps, this.routeCoordinates);
          } else {
            console.warn('🔄 Immediate recalculation: failed to get navigation steps from API');
            this.navigationState.isRecalculating = false;
            this.notifyListeners();
          }
        } catch (err) {
          console.error('🔄 Immediate recalculation error:', err);
          this.navigationState.isRecalculating = false;
          this.notifyListeners();
        } finally {
          this.pendingRecalculation = false;
        }
      })();

      // We started recalculation immediately; don't wait for hysteresis — exit now.
      return true;
    }

    // Short hysteresis for non-forced cases: require two confirmations
    if (!forceByDistance) {
      this.offRouteCounter++;
      if (this.offRouteCounter < 2) {
        this.lastLocation = location;
        this.lastLocationTimestamp = now;
        return true;
      }
    }
    this.offRouteCounter = 0;

    // Attempt recalculation if we have a start point and a destination
    if (recalculationStart && this.lastTripDestination) {
      try {
        Vibration.vibrate([50, 50, 50]);
        const fetchResult = await this.fetchNavigationStepsFromAPI(recalculationStart as { latitude: number; longitude: number }, this.lastTripDestination, this.currentMode);
        const newSteps = fetchResult?.steps || [];
        if (newSteps && newSteps.length > 0) {
          // Prefer fresh geometry returned by the routing API when available
          if (Array.isArray(fetchResult.flatCoords) && fetchResult.flatCoords.length >= 4) {
            this.routeCoordinates = fetchResult.flatCoords;
          } else {
            const flatFromService = (this.routeService && (this.routeService.routeCoords?.map((c: any) => [c.longitude, c.latitude]).flat())) || undefined;
            this.routeCoordinates = flatFromService || this.routeCoordinates;
          }

          await LastTripStorage.save({ destination: this.lastTripDestination, mode: this.currentMode, routeSteps: newSteps, fullRouteCoordinates: this.routeCoordinates });
          // Use finalize helper to update state and clear off-route banner
          await this.finalizeRecalculation(newSteps, this.routeCoordinates);
        } else {
          console.warn('🔄 Failed to get navigation steps from API after recalculation');
        }
      } catch (err) {
        console.error('🔄 Error during route recalculation:', err);
      }
    }

    this.pendingRecalculation = false;
    return true;
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

    // Log distance to nearest route point on every position update
    try {
      // Ensure we have flat route coordinates available locally by syncing
      // from routeService.routeCoords if present and our flat array is empty.
      try {
        if ((!this.routeCoordinates || this.routeCoordinates.length < 4) && this.routeService && Array.isArray((this.routeService as any).routeCoords) && (this.routeService as any).routeCoords.length >= 2) {
          const rc = (this.routeService as any).routeCoords as Array<{ latitude: number; longitude: number }>;
          // Flatten to [lon, lat, lon, lat, ...]
          this.routeCoordinates = rc.map(r => [r.longitude, r.latitude]).flat();
        }
      } catch (e) {
        // ignore
      }
      let distLog: number | null = null;
      let routeAvailable = false;
      let routePointCount = 0;

      if (this.isRouteServiceAvailable() && this.routeService) {
        // Try the service helper first
        if (typeof this.routeService.getDistanceToRoute === 'function') {
          try {
            const d = this.routeService.getDistanceToRoute({ latitude: location.latitude, longitude: location.longitude });
            if (!Number.isFinite(d)) {
              console.warn('[NavigationService.pos] routeService.getDistanceToRoute returned non-finite; disabling routeService temporarily');
              this.routeServiceDisabledUntil = Date.now() + 5000;
            } else {
              distLog = Math.round(d);
            }
          } catch (e) {
            console.warn('[NavigationService.pos] routeService.getDistanceToRoute threw', e);
            this.routeServiceDisabledUntil = Date.now() + 5000;
          }
        }

        // Check basic route availability
        try {
          const rcoords = (this.routeService.routeCoords as any) || [];
          routeAvailable = Array.isArray(rcoords) && rcoords.length >= 2;
          routePointCount = Array.isArray(rcoords) ? rcoords.length : 0;
        } catch (e) {
          routeAvailable = false;
          routePointCount = 0;
        }
      }

      // Fallback: if still null and routeService.routeCoords is available, compute locally
      if (distLog === null) {
        try {
          const rcoords = (this.routeService && (this.routeService.routeCoords as any)) || null;
          if (Array.isArray(rcoords) && rcoords.length >= 2) {
            const fallback = this.computeDistanceToRouteFromCoordArray(location, rcoords);
            if (Number.isFinite(fallback)) distLog = Math.round(fallback);
          }
        } catch (e) {
          // ignore
        }
      }

  // position logging removed
    } catch (e) {
      // ignore logging errors
    }

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

          // Never allow changing to a step we've already passed
          if (closestStepIndex <= this.maxPassedStepIndex) {
            // ignore suggestion to go back to a passed step
            shouldChangeStep = false;
          } else {

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
      }

      // Vérifier si on a quitté la route : déléguer à la routine centralisée
      try {
        const offRouteHandled = await this.performOffRouteCheck(location);
        if (offRouteHandled) return;
      } catch (e) {
        // ignore
      }

      // If we are on route, clear off-route flag if it was set and no recalculation is pending
      try {
        const onRouteNow = this.routeService && typeof this.routeService.isOnRoute === 'function'
          ? this.routeService.isOnRoute({ latitude: location.latitude, longitude: location.longitude }, this.offRouteTolerance)
          : true;

        if (onRouteNow && this.navigationState.isOffRoute && !this.pendingRecalculation) {
          this.navigationState.isOffRoute = false;
          this.offRouteCounter = 0;
          this.pendingRecalculation = false;
          this.notifyListeners();
        }
      } catch (e) {
        // ignore detection faults
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

      const prevIndex = this.navigationState.currentStepIndex;
      this.navigationState.currentStepIndex = nextIndex;
      // mark previous step as passed so we never go back to it
      this.maxPassedStepIndex = Math.max(this.maxPassedStepIndex, prevIndex);
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
    // remainingDistance should be: distance from current location to the next step
    // (navigationState.distanceToNextStep) plus the sum of distances of steps AFTER
    // the current step. Avoid double-counting the current step's full distance.
    const remainingStepsAfterCurrent = this.navigationState.steps.slice(
      this.navigationState.currentStepIndex + 1
    );
    this.navigationState.remainingDistance =
      this.calculateTotalDistance(remainingStepsAfterCurrent) +
      (this.navigationState.distanceToNextStep || 0);
    this.navigationState.remainingDuration =
      this.calculateTotalDuration(remainingStepsAfterCurrent) +
      0; // distanceToNextStep is a distance, duration for the partial current step is unknown
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
  ): Promise<{ steps: NavigationStep[]; flatCoords?: number[] }> {
    try {
      const osrmMode =
        mode === "bicycling" ? "bike" : mode === "walking" ? "foot" : "driving";
      const url = `https://routing.openstreetmap.de/routed-car/route/v1/${osrmMode}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        // Convertir les étapes
        const steps = this.convertRouteToNavigationSteps(data);
        // Extract flat coordinates from the returned geometry (GeoJSON coordinates are [lon, lat])
        try {
          const coords = data.routes[0].geometry && data.routes[0].geometry.coordinates ? data.routes[0].geometry.coordinates : [];
          if (Array.isArray(coords) && coords.length > 0) {
            const flatCoords = (coords as any[]).flat();
            return { steps, flatCoords };
          }
        } catch (e) {
          // fallback: return steps without coords
        }

        return { steps };
      } else {
        console.warn("🔄 No routes found in OSRM response");
        return { steps: [] };
      }
    } catch (error) {
      console.error("🔄 Error fetching navigation steps from OSRM:", error);
      return { steps: [] };
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
    const allRouteCoords = this.convertRouteCoordinatesToPairs(
      this.routeCoordinates
    );
    if (!allRouteCoords || allRouteCoords.length === 0) return;

    // Find the closest point index on the full polyline to avoid relying on
    // remainingRouteCoordinates which may be out-of-sync after recalculation.
    let closestPointIndex = 0;
    let minDistance = Infinity;
    allRouteCoords.forEach((coord, index) => {
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

    // Update completed/remaining coordinates based on the closest index
    this.navigationState.completedRouteCoordinates = allRouteCoords.slice(
      0,
      closestPointIndex
    );
    this.navigationState.remainingRouteCoordinates = allRouteCoords.slice(
      closestPointIndex
    );

    // Update progress percentage
    const totalPoints = allRouteCoords.length;
    this.navigationState.progressPercentage = Math.min(
      100,
      Math.max(0, (closestPointIndex / totalPoints) * 100)
    );
  }

  // Obtenir les coordonnées de la route complétée (pour l'affichage)
  getCompletedRouteCoordinates(): [number, number][] {
    return this.navigationState.completedRouteCoordinates || [];
  }

  // Obtenir les coordonnées de la route restante (pour l'affichage)
  getRemainingRouteCoordinates(): [number, number][] {
    return this.navigationState.remainingRouteCoordinates || [];
  }

  // Convertit un track GPX en étapes de navigation simples
  public convertGpxTrackToNavigationSteps(track: Array<{ latitude: number; longitude: number; name?: string }>): NavigationStep[] {
    if (!track || track.length < 2) return [];
    const steps: NavigationStep[] = [];
    for (let i = 1; i < track.length; i++) {
      const prev = track[i - 1];
      const curr = track[i];
      const distance = this.calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      steps.push({
        instruction: `Aller vers le point suivant`,
        distance,
        duration: distance / 1.4, // vitesse piétonne ~5km/h
        maneuver: "straight",
        coordinates: [curr.longitude, curr.latitude],
        direction: "",
        streetName: curr.name || "GPX"
      });
    }
    return steps;
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

  // Compute minimal distance (meters) from location to a flat coords array [lon, lat, lon, lat, ...]
  private computeDistanceToRouteFromFlatCoords(location: { latitude: number; longitude: number }, flatCoords: number[]): number {
    if (!flatCoords || flatCoords.length < 4) return Infinity;

    const toRadians = (d: number) => d * (Math.PI / 180);
    const haversine = (aLat: number, aLon: number, bLat: number, bLon: number) => {
      const R = 6371000;
      const φ1 = toRadians(aLat);
      const φ2 = toRadians(bLat);
      const dφ = toRadians(bLat - aLat);
      const dλ = toRadians(bLon - aLon);
      const sinDlat = Math.sin(dφ / 2);
      const sinDlon = Math.sin(dλ / 2);
      const c = sinDlat * sinDlat + Math.cos(φ1) * Math.cos(φ2) * sinDlon * sinDlon;
      return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
    };

    let best = Infinity;
    for (let i = 0; i + 3 < flatCoords.length; i += 2) {
      const lon1 = flatCoords[i];
      const lat1 = flatCoords[i + 1];
      const lon2 = flatCoords[i + 2];
      const lat2 = flatCoords[i + 3];

      // project point onto segment
      const A = location.longitude - lon1;
      const B = location.latitude - lat1;
      const C = lon2 - lon1;
      const D = lat2 - lat1;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let xx: number, yy: number;
      if (lenSq === 0) {
        xx = lon1; yy = lat1;
      } else {
        let param = dot / lenSq;
        if (param < 0) { xx = lon1; yy = lat1; }
        else if (param > 1) { xx = lon2; yy = lat2; }
        else { xx = lon1 + param * C; yy = lat1 + param * D; }
      }

      const d = haversine(location.latitude, location.longitude, yy, xx);
      if (d < best) best = d;
    }

    return best;
  }

  // Compute minimal distance (meters) from location to an array of coords [{latitude, longitude}, ...]
  private computeDistanceToRouteFromCoordArray(location: { latitude: number; longitude: number }, coords: Array<{ latitude: number; longitude: number }>): number {
    if (!coords || coords.length < 2) return Infinity;

    const toRadians = (d: number) => d * (Math.PI / 180);
    const haversine = (aLat: number, aLon: number, bLat: number, bLon: number) => {
      const R = 6371000;
      const φ1 = toRadians(aLat);
      const φ2 = toRadians(bLat);
      const dφ = toRadians(bLat - aLat);
      const dλ = toRadians(bLon - aLon);
      const sinDlat = Math.sin(dφ / 2);
      const sinDlon = Math.sin(dλ / 2);
      const c = sinDlat * sinDlat + Math.cos(φ1) * Math.cos(φ2) * sinDlon * sinDlon;
      return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
    };

    let best = Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];

      const A = location.longitude - a.longitude;
      const B = location.latitude - a.latitude;
      const C = b.longitude - a.longitude;
      const D = b.latitude - a.latitude;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let xx: number, yy: number;
      if (lenSq === 0) {
        xx = a.longitude; yy = a.latitude;
      } else {
        let param = dot / lenSq;
        if (param < 0) { xx = a.longitude; yy = a.latitude; }
        else if (param > 1) { xx = b.longitude; yy = b.latitude; }
        else { xx = a.longitude + param * C; yy = a.latitude + param * D; }
      }

      const d = haversine(location.latitude, location.longitude, yy, xx);
      if (d < best) best = d;
    }

    return best;
  }

  // Compute closest point on flat coords [lon, lat, lon, lat,...] and return {latitude, longitude}
  private computeClosestPointOnFlatCoords(location: { latitude: number; longitude: number }, flatCoords: number[]): { latitude: number; longitude: number } | null {
    if (!flatCoords || flatCoords.length < 4) return null;
    let best = { d: Infinity, lat: 0, lon: 0 };
    for (let i = 0; i + 3 < flatCoords.length; i += 2) {
      const lon1 = flatCoords[i];
      const lat1 = flatCoords[i + 1];
      const lon2 = flatCoords[i + 2];
      const lat2 = flatCoords[i + 3];

      const A = location.longitude - lon1;
      const B = location.latitude - lat1;
      const C = lon2 - lon1;
      const D = lat2 - lat1;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let xx: number, yy: number;
      if (lenSq === 0) {
        xx = lon1; yy = lat1;
      } else {
        let param = dot / lenSq;
        if (param < 0) { xx = lon1; yy = lat1; }
        else if (param > 1) { xx = lon2; yy = lat2; }
        else { xx = lon1 + param * C; yy = lat1 + param * D; }
      }

      const d = this.calculateDistance(location.latitude, location.longitude, yy, xx);
      if (d < best.d) {
        best = { d, lat: yy, lon: xx };
      }
    }

    if (!Number.isFinite(best.d)) return null;
    return { latitude: best.lat, longitude: best.lon };
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

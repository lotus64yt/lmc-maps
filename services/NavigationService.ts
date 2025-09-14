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
  private routeService: any = null;
  private currentMode: string = "driving";
  private lastRouteCheck: number = 0;
  private offRouteCounter: number = 0;
  private distanceBuffer: number[] = [];
  private distanceBufferSize: number = 5;
  private lastLocationTimestamp: number = 0;
  private lastLocation: { latitude: number; longitude: number } | null = null;
  private routeCoordinates: number[] = [];
  private lastTripDestination: {
    latitude: number;
    longitude: number;
    name?: string;
  } | null = null;
  private initialLocation: { latitude: number; longitude: number } | null = null;
  private movementThreshold: number = 20;
  private lastStepChangeTime: number = 0;
  private stepChangeMinInterval: number = 3000;
  private stepToleranceDistance: number = 50;
  private offRouteTolerance: number = 20;
  private offRouteCheckInterval: number = 5000;
  private offRouteTimer: any = null;
  private maxPassedStepIndex: number = -1;
  private recalcDistanceThreshold: number = 50;
  private routeServiceDisabledUntil: number = 0;
  private pendingRecalculation: boolean = false;

  private async finalizeRecalculation(newSteps?: NavigationStep[], newFlatCoords?: number[]) {
    try {
      if (Array.isArray(newSteps) && newSteps.length > 0) {
        this.navigationState.steps = newSteps;
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

      this.navigationState.isOffRoute = false;
      this.navigationState.isRecalculating = false;
      this.pendingRecalculation = false;
      this.offRouteCounter = 0;
      this.notifyListeners();
    } catch (e) {
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
    Vibration.vibrate(150);

    this.routeService = routeService;
    this.currentMode = mode;
    this.routeCoordinates = fullRouteCoordinates || [];
    this.lastTripDestination = destinationInfo || null;

    if (routeSteps.length > 0 && destinationInfo) {
      await LastTripStorage.save({
        destination: destinationInfo,
        mode,
        routeSteps,
        fullRouteCoordinates: fullRouteCoordinates || [],
      });
    }

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

      if (routeSteps.length > 0) {
        const closestStepIndex = NavigationInstructionService.findClosestStep(
          currentLocation,
          routeSteps
        );

        if (closestStepIndex > 0) {
          const distanceToFirst = this.calculateDistanceToStep(
            currentLocation,
            routeSteps[0]
          );
          const distanceToClosest = this.calculateDistanceToStep(
            currentLocation,
            routeSteps[closestStepIndex]
          );

          if (
            distanceToClosest < distanceToFirst - 100 &&
            distanceToFirst > 150
          ) {
            initialStepIndex = closestStepIndex;
          }
        }
      }
    } catch (error) {
    }

    this.navigationState = {
      ...this.navigationState,
      isNavigating: true,
      currentStepIndex: initialStepIndex,
      steps: routeSteps,
      remainingDistance: this.calculateTotalDistance(routeSteps),
      remainingDuration: this.calculateTotalDuration(routeSteps),
      nextStep: routeSteps[initialStepIndex],
      distanceToNextStep: routeSteps[initialStepIndex]?.distance || 0,
      currentLocation: currentLocation,
      completedRouteCoordinates: [],
      remainingRouteCoordinates: this.convertRouteCoordinatesToPairs(
        fullRouteCoordinates || []
      ),
      progressPercentage: 0,
      hasStartedMoving: initialStepIndex > 0,
    };

  this.maxPassedStepIndex = initialStepIndex - 1;

    this.startLocationTracking();
  this.startOffRouteTimer();
    this.notifyListeners();
  }

  async stopNavigation() {
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

    this.initialLocation = null;

    this.stopLocationTracking();
  this.stopOffRouteTimer();
    this.notifyListeners();
  }

  private async startLocationTracking() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }

      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 5,
        },
        (location) => {
          this.updateCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      );
    } catch (error) {
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
            });
          }
        } catch (e) {
        }
      }, this.offRouteCheckInterval);
    } catch (e) {
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
    }
  }

  private async performOffRouteCheck(location: { latitude: number; longitude: number }): Promise<boolean> {
    const now = Date.now();
    if (!this.navigationState || !this.navigationState.isNavigating) return false;
    if (now - this.lastRouteCheck < this.offRouteCheckInterval) return false;
    this.lastRouteCheck = now;

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
      try {
        if (this.routeCoordinates && this.routeCoordinates.length >= 4) {
          distanceToRoute = this.computeDistanceToRouteFromFlatCoords(location, this.routeCoordinates);
        }
      } catch (e) {
        distanceToRoute = Infinity;
      }
    }

    this.distanceBuffer.push(distanceToRoute);
    if (this.distanceBuffer.length > this.distanceBufferSize) this.distanceBuffer.shift();
    const sorted = [...this.distanceBuffer].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length ? (sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : Infinity;

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
    } catch (e) {  }

    if (forceByDistance && !this.navigationState.isOffRoute) {
      this.navigationState.isOffRoute = true;
      this.notifyListeners();
    }

    if (!finalOffRouteDecision) return false;

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
      }
    }

    this.navigationState.isOffRoute = true;
    this.pendingRecalculation = true;
    this.navigationState.isRecalculating = true;
    this.notifyListeners();

    if (recalculationStart && this.lastTripDestination) {
      if (!this.pendingRecalculation) {
        this.pendingRecalculation = true;
        this.navigationState.isRecalculating = true;
      }

      (async () => {
        try {
          Vibration.vibrate([50, 50, 50]);
          const fetchResult = await this.fetchNavigationStepsFromAPI(recalculationStart as { latitude: number; longitude: number }, this.lastTripDestination, this.currentMode);
          const newSteps = fetchResult?.steps || [];
          if (newSteps && newSteps.length > 0) {
            if (Array.isArray(fetchResult.flatCoords) && fetchResult.flatCoords.length >= 4) {
              this.routeCoordinates = fetchResult.flatCoords;
            } else {
              const flatFromService = (this.routeService && (this.routeService.routeCoords?.map((c: any) => [c.longitude, c.latitude]).flat())) || undefined;
              this.routeCoordinates = flatFromService || this.routeCoordinates;
            }

            await LastTripStorage.save({ destination: this.lastTripDestination, mode: this.currentMode, routeSteps: newSteps, fullRouteCoordinates: this.routeCoordinates });
            await this.finalizeRecalculation(newSteps, this.routeCoordinates);
          } else {
            this.navigationState.isRecalculating = false;
            this.notifyListeners();
          }
        } catch (err) {
          this.navigationState.isRecalculating = false;
          this.notifyListeners();
        } finally {
          this.pendingRecalculation = false;
        }
      })();

      return true;
    }

    if (!forceByDistance) {
      this.offRouteCounter++;
      if (this.offRouteCounter < 2) {
        this.lastLocation = location;
        this.lastLocationTimestamp = now;
        return true;
      }
    }
    this.offRouteCounter = 0;

    if (recalculationStart && this.lastTripDestination) {
      try {
        Vibration.vibrate([50, 50, 50]);
        const fetchResult = await this.fetchNavigationStepsFromAPI(recalculationStart as { latitude: number; longitude: number }, this.lastTripDestination, this.currentMode);
        const newSteps = fetchResult?.steps || [];
        if (newSteps && newSteps.length > 0) {
          if (Array.isArray(fetchResult.flatCoords) && fetchResult.flatCoords.length >= 4) {
            this.routeCoordinates = fetchResult.flatCoords;
          } else {
            const flatFromService = (this.routeService && (this.routeService.routeCoords?.map((c: any) => [c.longitude, c.latitude]).flat())) || undefined;
            this.routeCoordinates = flatFromService || this.routeCoordinates;
          }

          await LastTripStorage.save({ destination: this.lastTripDestination, mode: this.currentMode, routeSteps: newSteps, fullRouteCoordinates: this.routeCoordinates });
          await this.finalizeRecalculation(newSteps, this.routeCoordinates);
        } else {
        }
      } catch (err) {
      }
    }

    this.pendingRecalculation = false;
    return true;
  }

  private stopLocationTracking() {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
  }

  private async updateCurrentLocation(location: {
    latitude: number;
    longitude: number;
  }) {
    this.navigationState.currentLocation = location;

    try {
      try {
        if ((!this.routeCoordinates || this.routeCoordinates.length < 4) && this.routeService && Array.isArray((this.routeService as any).routeCoords) && (this.routeService as any).routeCoords.length >= 2) {
          const rc = (this.routeService as any).routeCoords as Array<{ latitude: number; longitude: number }>;
          this.routeCoordinates = rc.map(r => [r.longitude, r.latitude]).flat();
        }
      } catch (e) {
      }
      let distLog: number | null = null;
      let routeAvailable = false;
      let routePointCount = 0;

      if (this.isRouteServiceAvailable() && this.routeService) {
        if (typeof this.routeService.getDistanceToRoute === 'function') {
          try {
            const d = this.routeService.getDistanceToRoute({ latitude: location.latitude, longitude: location.longitude });
            if (!Number.isFinite(d)) {
              this.routeServiceDisabledUntil = Date.now() + 5000;
            } else {
              distLog = Math.round(d);
            }
          } catch (e) {
            this.routeServiceDisabledUntil = Date.now() + 5000;
          }
        }

        try {
          const rcoords = (this.routeService.routeCoords as any) || [];
          routeAvailable = Array.isArray(rcoords) && rcoords.length >= 2;
          routePointCount = Array.isArray(rcoords) ? rcoords.length : 0;
        } catch (e) {
          routeAvailable = false;
          routePointCount = 0;
        }
      }

      if (distLog === null) {
        try {
          const rcoords = (this.routeService && (this.routeService.routeCoords as any)) || null;
          if (Array.isArray(rcoords) && rcoords.length >= 2) {
            const fallback = this.computeDistanceToRouteFromCoordArray(location, rcoords);
            if (Number.isFinite(fallback)) distLog = Math.round(fallback);
          }
        } catch (e) {
        }
      }

    } catch (e) {
    }

    if (this.navigationState.isNavigating && this.navigationState.nextStep) {
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

      this.updateRouteProgress(location);

      if (this.navigationState.hasStartedMoving) {
        const closestStepIndex = NavigationInstructionService.findClosestStep(
          location,
          this.navigationState.steps
        );
        const now = Date.now();

        if (
          closestStepIndex !== this.navigationState.currentStepIndex &&
          closestStepIndex >= 0
        ) {
          const currentStep =
            this.navigationState.steps[this.navigationState.currentStepIndex];
          const suggestedStep = this.navigationState.steps[closestStepIndex];

          let shouldChangeStep = false;

          if (closestStepIndex <= this.maxPassedStepIndex) {
            shouldChangeStep = false;
          } else {

          const timeSinceLastChange = now - this.lastStepChangeTime;
          if (timeSinceLastChange >= this.stepChangeMinInterval) {
            if (currentStep?.coordinates && suggestedStep?.coordinates) {
              const distanceToCurrentStep = this.calculateDistanceToStep(
                location,
                currentStep
              );
              const distanceToSuggestedStep = this.calculateDistanceToStep(
                location,
                suggestedStep
              );


              if (closestStepIndex > this.navigationState.currentStepIndex) {
                if (
                  distanceToSuggestedStep < distanceToCurrentStep ||
                  distanceToCurrentStep > 200
                ) {
                  shouldChangeStep = true;
                }
              }
              else if (
                closestStepIndex < this.navigationState.currentStepIndex
              ) {
                if (
                  distanceToSuggestedStep <
                  distanceToCurrentStep - this.stepToleranceDistance * 2
                ) {
                  shouldChangeStep = true;
                }
              }
            } else {
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

            Vibration.vibrate([100, 50, 100, 50, 100]);
          }
          }
        }
      }

      try {
        const offRouteHandled = await this.performOffRouteCheck(location);
        if (offRouteHandled) return;
      } catch (e) {
      }

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
      }

      const distanceToNext = this.calculateDistance(
        location.latitude,
        location.longitude,
        this.navigationState.nextStep.coordinates[1],
        this.navigationState.nextStep.coordinates[0]
      );

      this.navigationState.distanceToNextStep = distanceToNext;

      if (
        distanceToNext < 30 &&
        this.navigationState.currentStepIndex <
          this.navigationState.steps.length - 1
      ) {
        this.advanceToNextStep();
      }

      this.updateRemainingStats();

      this.notifyListeners();
    }
  }

  private async advanceToNextStep() {
    const nextIndex = this.navigationState.currentStepIndex + 1;

    if (nextIndex < this.navigationState.steps.length) {
      Vibration.vibrate([100, 50, 100]);

      const prevIndex = this.navigationState.currentStepIndex;
      this.navigationState.currentStepIndex = nextIndex;
      this.maxPassedStepIndex = Math.max(this.maxPassedStepIndex, prevIndex);
      this.navigationState.nextStep = this.navigationState.steps[nextIndex];
      this.navigationState.distanceToNextStep =
        this.navigationState.nextStep?.distance || 0;

      this.lastNotificationTime = Date.now();
    } else {
      Vibration.vibrate([200, 100, 200, 100, 200]);

      this.stopNavigation();
    }
  }

  private updateRemainingStats() {
    const remainingStepsAfterCurrent = this.navigationState.steps.slice(
      this.navigationState.currentStepIndex + 1
    );
    this.navigationState.remainingDistance =
      this.calculateTotalDistance(remainingStepsAfterCurrent) +
      (this.navigationState.distanceToNextStep || 0);
    this.navigationState.remainingDuration =
      this.calculateTotalDuration(remainingStepsAfterCurrent) +
      0;
  }

  private calculateTotalDistance(steps: NavigationStep[]): number {
    return steps.reduce((total, step) => total + step.distance, 0);
  }

  private calculateTotalDuration(steps: NavigationStep[]): number {
    return steps.reduce((total, step) => total + step.duration, 0);
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3;
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
        const steps = this.convertRouteToNavigationSteps(data);
        try {
          const coords = data.routes[0].geometry && data.routes[0].geometry.coordinates ? data.routes[0].geometry.coordinates : [];
          if (Array.isArray(coords) && coords.length > 0) {
            const flatCoords = (coords as any[]).flat();
            return { steps, flatCoords };
          }
        } catch (e) {
        }

        return { steps };
      } else {
        return { steps: [] };
      }
    } catch (error) {
      return { steps: [] };
    }
  }

  convertRouteToNavigationSteps(routeData: any): NavigationStep[] {
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

  private getDirection(bearing?: number): string {
    if (bearing === undefined) return "";

    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

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

  private updateRouteProgress(currentLocation: {
    latitude: number;
    longitude: number;
  }) {
    const allRouteCoords = this.convertRouteCoordinatesToPairs(
      this.routeCoordinates
    );
    if (!allRouteCoords || allRouteCoords.length === 0) return;

    let closestPointIndex = 0;
    let minDistance = Infinity;
    allRouteCoords.forEach((coord, index) => {
      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        coord[1],
        coord[0]
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestPointIndex = index;
      }
    });

    this.navigationState.completedRouteCoordinates = allRouteCoords.slice(
      0,
      closestPointIndex
    );
    this.navigationState.remainingRouteCoordinates = allRouteCoords.slice(
      closestPointIndex
    );

    const totalPoints = allRouteCoords.length;
    this.navigationState.progressPercentage = Math.min(
      100,
      Math.max(0, (closestPointIndex / totalPoints) * 100)
    );
  }

  getCompletedRouteCoordinates(): [number, number][] {
    return this.navigationState.completedRouteCoordinates || [];
  }

  getRemainingRouteCoordinates(): [number, number][] {
    return this.navigationState.remainingRouteCoordinates || [];
  }

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
        duration: distance / 1.4,
        maneuver: "straight",
        coordinates: [curr.longitude, curr.latitude],
        direction: "",
        streetName: curr.name || "GPX"
      });
    }
    return steps;
  }

  private calculateDistanceToStep(
    userLocation: { latitude: number; longitude: number },
    step: NavigationStep
  ): number {
    if (!step.coordinates || step.coordinates.length < 2) {
      return Infinity;
    }

    let minDistance = Infinity;

    const stepStart = {
      latitude: step.coordinates[1],
      longitude: step.coordinates[0],
    };

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

  getProgressPercentage(): number {
    return this.navigationState.progressPercentage || 0;
  }

  addListener(callback: (state: NavigationState) => void) {
    this.listeners.push(callback);
  }

  removeListener(callback: (state: NavigationState) => void) {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener({ ...this.navigationState }));
  }

  getCurrentState(): NavigationState {
    return { ...this.navigationState };
  }
}

export default new NavigationService();


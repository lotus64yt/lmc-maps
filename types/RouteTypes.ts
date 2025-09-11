export interface RouteStep {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  type: 'address' | 'poi';
  amenityType?: string;
}

export interface MultiStepRoute {
  steps: RouteStep[];
  totalDistance?: number;
  totalDuration?: number;
}

export interface NavigationStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: string;
  coordinates: [number, number];
  direction?: string;
  streetName?: string;
}

export interface NavigationState {
  isNavigating: boolean;
  currentStepIndex: number;
  steps: NavigationStep[];
  remainingDistance: number;
  remainingDuration: number;
  nextStep?: NavigationStep;
  distanceToNextStep: number;
  currentLocation: {
    latitude: number;
    longitude: number;
  } | null;
  // Nouvelles propriétés pour la progression
  completedRouteCoordinates?: [number, number][]; // Coordonnées de la partie déjà parcourue
  remainingRouteCoordinates?: [number, number][]; // Coordonnées de la partie restante
  progressPercentage?: number; // Pourcentage de progression (0-100)
  hasStartedMoving?: boolean; // Pour éviter les faux sauts d'étapes au début
  isOffRoute?: boolean; // true when user left the planned route
  isRecalculating?: boolean; // true when actively recalculating route
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}
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
  completedRouteCoordinates?: [number, number][];
  remainingRouteCoordinates?: [number, number][];
  progressPercentage?: number;
  hasStartedMoving?: boolean;
  isOffRoute?: boolean;
  isRecalculating?: boolean;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}
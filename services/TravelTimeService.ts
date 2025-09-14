export interface TravelTimeResult {
  duration: number;
  distance: number;
  mode: TransportMode;
  route?: {
    polyline?: string;
    steps?: RouteStep[];
  };
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  startLocation: {
    latitude: number;
    longitude: number;
  };
  endLocation: {
    latitude: number;
    longitude: number;
  };
}

export type TransportMode = 'walking' | 'bicycling' | 'driving' | 'transit';

export interface TravelTimeRequest {
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
  mode: TransportMode;
  waypoints?: Array<{
    latitude: number;
    longitude: number;
  }>;
}

export class TravelTimeService {
  private static readonly OSRM_URL = 'https://router.project-osrm.org/route/v1';
  
  private static readonly AVERAGE_SPEEDS = {
    walking: 5,
    bicycling: 15,
    driving: 50,
    transit: 25
  };

  
  static async calculateTravelTime(request: TravelTimeRequest): Promise<TravelTimeResult> {
    try {
      const osrmResult = await this.calculateWithOSRM(request);
      return osrmResult;
    } catch (error) {
      return this.calculateApproximateTime(request);
    }
  }

  
  static async calculateMultiStepTravelTime(
    origin: { latitude: number; longitude: number },
    waypoints: Array<{ latitude: number; longitude: number }>,
    mode: TransportMode
  ): Promise<{
    totalDuration: number;
    totalDistance: number;
    segments: TravelTimeResult[];
  }> {
    try {
      const { segments, totalDistance, totalDuration } = await this.calculateMultiStepWithOSRM(
        origin,
        waypoints,
        mode
      );
      return { segments, totalDistance, totalDuration };
    } catch {
      const segments: TravelTimeResult[] = [];
      let totalDuration = 0;
      let totalDistance = 0;
      let currentPoint = origin;
      for (const waypoint of waypoints) {
        const request: TravelTimeRequest = { origin: currentPoint, destination: waypoint, mode };
        const result = await this.calculateTravelTime(request);
        segments.push(result);
        totalDuration += result.duration;
        totalDistance += result.distance;
        currentPoint = waypoint;
      }
      return { totalDuration, totalDistance, segments };
    }
  }

  private static async calculateWithOSRM(request: TravelTimeRequest): Promise<TravelTimeResult> {
    const { origin, destination, mode, waypoints } = request;
    const profile = this.convertToOsrmProfile(mode);
    if (!profile) {
      return this.calculateApproximateTime(request);
    }
    const coords: Array<{ latitude: number; longitude: number }> = [origin, ...(waypoints || []), destination];
    const coordStr = coords
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(';');
    const url = `${this.OSRM_URL}/${encodeURIComponent(profile)}/${coordStr}?overview=false&steps=true&alternatives=false&annotations=false&geometries=polyline`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.routes || data.routes.length === 0) {
      throw new Error('OSRM no route');
    }
    const route = data.routes[0];
    const legs = route.legs || [];
    const firstLeg = legs[0];
    const steps: RouteStep[] = (firstLeg?.steps || []).map((s: any) => ({
      instruction: [s.maneuver?.type, s.maneuver?.modifier, s.name].filter(Boolean).join(' '),
      distance: Math.round(s.distance || 0),
      duration: Math.round(s.duration || 0),
      startLocation: {
        latitude: s.maneuver?.location?.[1] ?? origin.latitude,
        longitude: s.maneuver?.location?.[0] ?? origin.longitude,
      },
      endLocation: {
        latitude: s.intersections?.[s.intersections.length - 1]?.location?.[1] ?? destination.latitude,
        longitude: s.intersections?.[s.intersections.length - 1]?.location?.[0] ?? destination.longitude,
      },
    }));
    return {
      duration: Math.round(route.duration || 0),
      distance: Math.round(route.distance || 0),
      mode,
      route: {
        steps,
      },
    };
  }

  private static async calculateMultiStepWithOSRM(
    origin: { latitude: number; longitude: number },
    waypoints: Array<{ latitude: number; longitude: number }>,
    mode: TransportMode
  ): Promise<{ segments: TravelTimeResult[]; totalDuration: number; totalDistance: number }> {
    const profile = this.convertToOsrmProfile(mode);
    if (!profile) {
      throw new Error('Unsupported mode for OSRM');
    }
    if (!waypoints || waypoints.length < 1) {
      return { segments: [], totalDuration: 0, totalDistance: 0 };
    }
    const coords = [origin, ...waypoints];
    const coordStr = coords.map((c) => `${c.longitude},${c.latitude}`).join(';');
    const url = `${this.OSRM_URL}/${encodeURIComponent(profile)}/${coordStr}?overview=false&steps=true&alternatives=false&annotations=false&geometries=polyline`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
    const data = await response.json();
    if (!data || !data.routes || data.routes.length === 0) throw new Error('OSRM no route');
    const route = data.routes[0];
    const legs: any[] = route.legs || [];
    const segments: TravelTimeResult[] = legs.map((leg, idx) => {
      const from = coords[idx];
      const to = coords[idx + 1];
      const steps: RouteStep[] = (leg.steps || []).map((s: any) => ({
        instruction: [s.maneuver?.type, s.maneuver?.modifier, s.name].filter(Boolean).join(' '),
        distance: Math.round(s.distance || 0),
        duration: Math.round(s.duration || 0),
        startLocation: {
          latitude: s.maneuver?.location?.[1] ?? from.latitude,
          longitude: s.maneuver?.location?.[0] ?? from.longitude,
        },
        endLocation: {
          latitude: s.intersections?.[s.intersections.length - 1]?.location?.[1] ?? to.latitude,
          longitude: s.intersections?.[s.intersections.length - 1]?.location?.[0] ?? to.longitude,
        },
      }));
      return {
        duration: Math.round(leg.duration || 0),
        distance: Math.round(leg.distance || 0),
        mode,
        route: { steps },
      } as TravelTimeResult;
    });
    return {
      segments,
      totalDuration: Math.round(route.duration || segments.reduce((a, s) => a + s.duration, 0)),
      totalDistance: Math.round(route.distance || segments.reduce((a, s) => a + s.distance, 0)),
    };
  }

  
  private static calculateApproximateTime(request: TravelTimeRequest): TravelTimeResult {
    const { origin, destination, mode } = request;
    
    const distance = this.calculateHaversineDistance(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );
    
    const routeFactor = this.getRouteFactor(mode);
    const realDistance = distance * routeFactor;
    
    const avgSpeed = this.AVERAGE_SPEEDS[mode];
    const durationHours = realDistance / 1000 / avgSpeed;
    const duration = Math.round(durationHours * 3600);
    
    return {
      duration,
      distance: Math.round(realDistance),
      mode
    };
  }

  
  private static calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  
  private static getRouteFactor(mode: TransportMode): number {
    switch (mode) {
      case 'walking':
        return 1.2;
      case 'bicycling':
        return 1.3;
      case 'driving':
        return 1.4;
      case 'transit':
        return 1.5;
      default:
        return 1.3;
    }
  }

  private static convertToOsrmProfile(mode: TransportMode): string | null {
    switch (mode) {
      case 'walking':
        return 'walking';
      case 'bicycling':
        return 'cycling';
      case 'driving':
        return 'driving';
      case 'transit':
        return null;
      default:
        return 'driving';
    }
  }

  
  static async calculateTravelTimeWithTraffic(
    request: TravelTimeRequest,
    departureTime?: Date
  ): Promise<TravelTimeResult & { durationInTraffic?: number }> {
    const base = await this.calculateTravelTime(request);
    if (request.mode !== 'driving') {
      return base;
    }
    const trafficFactor = this.estimateTrafficFactor(departureTime);
    const durationInTraffic = Math.round(base.duration * trafficFactor);
    return { ...base, durationInTraffic };
  }

  
  private static estimateTrafficFactor(departureTime?: Date): number {
    if (!departureTime) {
      departureTime = new Date();
    }
    
    const hour = departureTime.getHours();
    const dayOfWeek = departureTime.getDay();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 1.1;
    }
    
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      return 1.8;
    }
    
    if (hour >= 10 && hour <= 16) {
      return 1.3;
    }
    
    return 1.1;
  }

  
  static async compareTravelModes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number }
  ): Promise<Record<TransportMode, TravelTimeResult>> {
    const modes: TransportMode[] = ['walking', 'bicycling', 'driving', 'transit'];
    const results: Record<TransportMode, TravelTimeResult> = {} as any;
    
    const promises = modes.map(async (mode) => {
      try {
        const result = await this.calculateTravelTime({
          origin,
          destination,
          mode
        });
        return { mode, result };
      } catch (error) {
        return {
          mode,
          result: this.calculateApproximateTime({
            origin,
            destination,
            mode
          })
        };
      }
    });
    
    const resolvedResults = await Promise.all(promises);
    
    resolvedResults.forEach(({ mode, result }) => {
      results[mode] = result;
    });
    
    return results;
  }
}


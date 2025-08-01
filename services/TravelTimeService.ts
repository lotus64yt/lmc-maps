export interface TravelTimeResult {
  duration: number; // en secondes
  distance: number; // en mètres
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
  // Clé API Google Maps (à remplacer par votre vraie clé)
  private static readonly GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';
  private static readonly GOOGLE_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
  
  // Vitesses moyennes approximatives (km/h) pour les calculs de fallback
  private static readonly AVERAGE_SPEEDS = {
    walking: 5,     // 5 km/h
    bicycling: 15,  // 15 km/h
    driving: 50,    // 50 km/h en ville
    transit: 25     // 25 km/h transport public
  };

  /**
   * Calcule le temps de trajet entre deux points
   */
  static async calculateTravelTime(request: TravelTimeRequest): Promise<TravelTimeResult> {
    try {
      // Essayer d'abord avec l'API Google Maps
      if (this.GOOGLE_MAPS_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY') {
        return await this.calculateWithGoogleMaps(request);
      }
      
      // Fallback sur le calcul approximatif
      return this.calculateApproximateTime(request);
    } catch (error) {
      console.warn('Erreur lors du calcul du temps de trajet avec API, utilisation du calcul approximatif:', error);
      return this.calculateApproximateTime(request);
    }
  }

  /**
   * Calcule le temps de trajet pour un itinéraire multi-étapes
   */
  static async calculateMultiStepTravelTime(
    origin: { latitude: number; longitude: number },
    waypoints: Array<{ latitude: number; longitude: number }>,
    mode: TransportMode
  ): Promise<{
    totalDuration: number;
    totalDistance: number;
    segments: TravelTimeResult[];
  }> {
    const segments: TravelTimeResult[] = [];
    let totalDuration = 0;
    let totalDistance = 0;
    
    let currentPoint = origin;
    
    for (const waypoint of waypoints) {
      const request: TravelTimeRequest = {
        origin: currentPoint,
        destination: waypoint,
        mode
      };
      
      const result = await this.calculateTravelTime(request);
      segments.push(result);
      totalDuration += result.duration;
      totalDistance += result.distance;
      
      currentPoint = waypoint;
    }
    
    return {
      totalDuration,
      totalDistance,
      segments
    };
  }

  /**
   * Calcul avec l'API Google Maps Directions
   */
  private static async calculateWithGoogleMaps(request: TravelTimeRequest): Promise<TravelTimeResult> {
    const { origin, destination, mode, waypoints } = request;
    
    // Convertir le mode de transport pour Google Maps
    const googleMode = this.convertToGoogleMode(mode);
    
    // Construire l'URL
    const params = new URLSearchParams({
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      mode: googleMode,
      key: this.GOOGLE_MAPS_API_KEY,
      language: 'fr'
    });
    
    // Ajouter les waypoints si présents
    if (waypoints && waypoints.length > 0) {
      const waypointsStr = waypoints
        .map(wp => `${wp.latitude},${wp.longitude}`)
        .join('|');
      params.append('waypoints', waypointsStr);
    }
    
    const url = `${this.GOOGLE_DIRECTIONS_URL}?${params.toString()}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    
    const route = data.routes[0];
    const leg = route.legs[0];
    
    return {
      duration: leg.duration.value,
      distance: leg.distance.value,
      mode,
      route: {
        polyline: route.overview_polyline?.points,
        steps: leg.steps?.map((step: any) => ({
          instruction: step.html_instructions?.replace(/<[^>]*>/g, '') || '',
          distance: step.distance.value,
          duration: step.duration.value,
          startLocation: {
            latitude: step.start_location.lat,
            longitude: step.start_location.lng
          },
          endLocation: {
            latitude: step.end_location.lat,
            longitude: step.end_location.lng
          }
        }))
      }
    };
  }

  /**
   * Calcul approximatif basé sur la distance à vol d'oiseau et les vitesses moyennes
   */
  private static calculateApproximateTime(request: TravelTimeRequest): TravelTimeResult {
    const { origin, destination, mode } = request;
    
    // Calcul de la distance à vol d'oiseau (formule de Haversine)
    const distance = this.calculateHaversineDistance(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );
    
    // Facteur de correction pour tenir compte des routes réelles
    const routeFactor = this.getRouteFactor(mode);
    const realDistance = distance * routeFactor;
    
    // Calcul du temps basé sur la vitesse moyenne
    const avgSpeed = this.AVERAGE_SPEEDS[mode];
    const durationHours = realDistance / 1000 / avgSpeed; // distance en km / vitesse
    const duration = Math.round(durationHours * 3600); // conversion en secondes
    
    return {
      duration,
      distance: Math.round(realDistance),
      mode
    };
  }

  /**
   * Calcule la distance entre deux points avec la formule de Haversine
   */
  private static calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convertit les degrés en radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Facteur de correction pour passer de la distance à vol d'oiseau à la distance réelle
   */
  private static getRouteFactor(mode: TransportMode): number {
    switch (mode) {
      case 'walking':
        return 1.2; // Les piétons peuvent prendre des raccourcis
      case 'bicycling':
        return 1.3; // Les vélos suivent généralement les routes
      case 'driving':
        return 1.4; // Les voitures doivent suivre les routes
      case 'transit':
        return 1.5; // Les transports publics ont des itinéraires fixes
      default:
        return 1.3;
    }
  }

  /**
   * Convertit notre mode de transport vers le format Google Maps
   */
  private static convertToGoogleMode(mode: TransportMode): string {
    switch (mode) {
      case 'walking':
        return 'walking';
      case 'bicycling':
        return 'bicycling';
      case 'driving':
        return 'driving';
      case 'transit':
        return 'transit';
      default:
        return 'driving';
    }
  }

  /**
   * Estime le temps de trajet en fonction des conditions de trafic
   */
  static async calculateTravelTimeWithTraffic(
    request: TravelTimeRequest,
    departureTime?: Date
  ): Promise<TravelTimeResult & { durationInTraffic?: number }> {
    if (request.mode !== 'driving') {
      // Le trafic n'affecte que la conduite
      return this.calculateTravelTime(request);
    }

    try {
      if (this.GOOGLE_MAPS_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY') {
        const params = new URLSearchParams({
          origin: `${request.origin.latitude},${request.origin.longitude}`,
          destination: `${request.destination.latitude},${request.destination.longitude}`,
          mode: 'driving',
          key: this.GOOGLE_MAPS_API_KEY,
          language: 'fr',
          departure_time: departureTime ? Math.floor(departureTime.getTime() / 1000).toString() : 'now'
        });

        const url = `${this.GOOGLE_DIRECTIONS_URL}?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const leg = route.legs[0];
          
          return {
            duration: leg.duration.value,
            distance: leg.distance.value,
            mode: request.mode,
            durationInTraffic: leg.duration_in_traffic?.value,
            route: {
              polyline: route.overview_polyline?.points
            }
          };
        }
      }
    } catch (error) {
      console.warn('Erreur lors du calcul avec trafic:', error);
    }

    // Fallback sans trafic
    const result = await this.calculateTravelTime(request);
    
    // Estimation approximative du trafic (facteur de 1.2 à 1.8 selon l'heure)
    const trafficFactor = this.estimateTrafficFactor(departureTime);
    const durationInTraffic = Math.round(result.duration * trafficFactor);
    
    return {
      ...result,
      durationInTraffic
    };
  }

  /**
   * Estime un facteur de trafic selon l'heure
   */
  private static estimateTrafficFactor(departureTime?: Date): number {
    if (!departureTime) {
      departureTime = new Date();
    }
    
    const hour = departureTime.getHours();
    const dayOfWeek = departureTime.getDay(); // 0 = dimanche, 6 = samedi
    
    // Weekend: moins de trafic
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 1.1;
    }
    
    // Heures de pointe en semaine
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      return 1.8; // Beaucoup de trafic
    }
    
    // Heures normales en semaine
    if (hour >= 10 && hour <= 16) {
      return 1.3; // Trafic modéré
    }
    
    // Nuit et très tôt le matin
    return 1.1; // Peu de trafic
  }

  /**
   * Compare les temps de trajet pour différents modes de transport
   */
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
        console.warn(`Erreur pour le mode ${mode}:`, error);
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

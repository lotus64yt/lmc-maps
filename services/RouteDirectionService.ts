import { Coordinate } from "../types/RouteTypes";

export interface RouteDirectionCalculation {
  bearing: number;
  isOnRoute: boolean;
  nearestPointIndex?: number;
  distanceToRoute?: number;
}

/**
 * Service pour calculer la direction de la route basée sur la position de l'utilisateur
 * et les coordonnées de la route pour un alignement optimal de la flèche de navigation
 */
export class RouteDirectionService {
  
  /**
   * Calcule la direction de la route à partir de la position actuelle de l'utilisateur
   */
  static calculateRouteDirection(
    userLocation: { latitude: number; longitude: number },
    routeCoords: Coordinate[],
    threshold: number = 30 // Distance maximale en mètres pour être considéré sur la route
  ): RouteDirectionCalculation {
    
    if (!routeCoords || routeCoords.length < 2) {
      return { bearing: 0, isOnRoute: false };
    }

    // Trouver le segment de route le plus proche
    const nearestSegment = this.findNearestRouteSegment(userLocation, routeCoords);
    
    if (!nearestSegment || nearestSegment.distance > threshold) {
      return { bearing: 0, isOnRoute: false, distanceToRoute: nearestSegment?.distance };
    }

    // L'utilisateur est sur la route, calculer la direction du segment
    const segmentBearing = this.calculateSegmentBearing(
      nearestSegment.start,
      nearestSegment.end
    );

    // Calculer la direction future (regarder plus loin sur la route pour une direction plus stable)
    const futureBearing = this.calculateFutureRouteDirection(
      routeCoords,
      nearestSegment.startIndex,
      100 // Distance de regard en avant (en mètres)
    );

    // Utiliser la direction future si disponible, sinon la direction du segment actuel
    const finalBearing = futureBearing !== null ? futureBearing : segmentBearing;

    return {
      bearing: finalBearing,
      isOnRoute: true,
      nearestPointIndex: nearestSegment.startIndex,
      distanceToRoute: nearestSegment.distance
    };
  }

  /**
   * Trouve le segment de route le plus proche de la position de l'utilisateur
   */
  private static findNearestRouteSegment(
    userLocation: { latitude: number; longitude: number },
    routeCoords: Coordinate[]
  ): {
    start: Coordinate;
    end: Coordinate;
    startIndex: number;
    distance: number;
    projectedPoint: Coordinate;
  } | null {
    
    let nearestSegment = null;
    let minDistance = Infinity;

    for (let i = 0; i < routeCoords.length - 1; i++) {
      const segmentStart = routeCoords[i];
      const segmentEnd = routeCoords[i + 1];
      
      const projection = this.projectPointOnSegment(userLocation, segmentStart, segmentEnd);
      const distance = this.calculateDistance(userLocation, projection.point);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestSegment = {
          start: segmentStart,
          end: segmentEnd,
          startIndex: i,
          distance: distance,
          projectedPoint: projection.point
        };
      }
    }

    return nearestSegment;
  }

  /**
   * Projette un point sur un segment de ligne et retourne le point projeté
   */
  private static projectPointOnSegment(
    point: { latitude: number; longitude: number },
    segmentStart: Coordinate,
    segmentEnd: Coordinate
  ): { point: Coordinate; t: number } {
    
    const A = point.latitude - segmentStart.latitude;
    const B = point.longitude - segmentStart.longitude;
    const C = segmentEnd.latitude - segmentStart.latitude;
    const D = segmentEnd.longitude - segmentStart.longitude;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    let t = 0;
    if (lenSq !== 0) {
      t = Math.max(0, Math.min(1, dot / lenSq));
    }
    
    const projectedPoint = {
      latitude: segmentStart.latitude + t * C,
      longitude: segmentStart.longitude + t * D
    };

    return { point: projectedPoint, t };
  }

  /**
   * Calcule la direction (bearing) d'un segment de route
   */
  private static calculateSegmentBearing(start: Coordinate, end: Coordinate): number {
    const dLon = this.toRadians(end.longitude - start.longitude);
    const lat1 = this.toRadians(start.latitude);
    const lat2 = this.toRadians(end.latitude);
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - 
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x);
    return (this.toDegrees(bearing) + 360) % 360;
  }

  /**
   * Calcule la direction future de la route en regardant plus loin
   * pour une direction plus stable et prévisible
   */
  private static calculateFutureRouteDirection(
    routeCoords: Coordinate[],
    currentIndex: number,
    lookAheadDistance: number // en mètres
  ): number | null {
    
    if (currentIndex >= routeCoords.length - 1) {
      return null;
    }

    const startPoint = routeCoords[currentIndex];
    let accumulatedDistance = 0;
    let endIndex = currentIndex + 1;

    // Accumuler la distance jusqu'à atteindre la distance de regard en avant
    for (let i = currentIndex + 1; i < routeCoords.length; i++) {
      const segmentDistance = this.calculateDistance(routeCoords[i - 1], routeCoords[i]);
      accumulatedDistance += segmentDistance;
      
      if (accumulatedDistance >= lookAheadDistance) {
        endIndex = i;
        break;
      }
      
      endIndex = i;
    }

    // Si on n'a pas assez de route devant, utiliser le dernier point disponible
    if (endIndex === currentIndex + 1 && accumulatedDistance < lookAheadDistance / 2) {
      return null;
    }

    const endPoint = routeCoords[endIndex];
    return this.calculateSegmentBearing(startPoint, endPoint);
  }

  /**
   * Calcule la distance entre deux points en utilisant la formule de Haversine
   * (méthode publique pour utilisation externe)
   */
  static calculateDistance(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number {
    const R = 6371000; // Rayon de la Terre en mètres
    const φ1 = this.toRadians(point1.latitude);
    const φ2 = this.toRadians(point2.latitude);
    const Δφ = this.toRadians(point2.latitude - point1.latitude);
    const Δλ = this.toRadians(point2.longitude - point1.longitude);

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Calcule une direction lissée en moyennant plusieurs segments
   * pour réduire les variations brusques
   */
  static calculateSmoothedRouteDirection(
    userLocation: { latitude: number; longitude: number },
    routeCoords: Coordinate[],
    smoothingDistance: number = 50 // Distance en mètres pour le lissage
  ): RouteDirectionCalculation {
    
    const baseResult = this.calculateRouteDirection(userLocation, routeCoords);
    
    if (!baseResult.isOnRoute || baseResult.nearestPointIndex === undefined) {
      return baseResult;
    }

    // Calculer plusieurs directions dans un rayon de lissage
    const bearings: number[] = [];
    const startIndex = Math.max(0, baseResult.nearestPointIndex - 2);
    const endIndex = Math.min(routeCoords.length - 2, baseResult.nearestPointIndex + 2);

    for (let i = startIndex; i <= endIndex; i++) {
      const bearing = this.calculateSegmentBearing(routeCoords[i], routeCoords[i + 1]);
      bearings.push(bearing);
    }

    // Calculer la moyenne des bearings en tenant compte de la nature circulaire des angles
    const smoothedBearing = this.calculateMeanBearing(bearings);

    return {
      ...baseResult,
      bearing: smoothedBearing
    };
  }

  /**
   * Calcule la moyenne de plusieurs bearings en tenant compte de leur nature circulaire
   */
  private static calculateMeanBearing(bearings: number[]): number {
    if (bearings.length === 0) return 0;
    if (bearings.length === 1) return bearings[0];

    let x = 0;
    let y = 0;

    bearings.forEach(bearing => {
      const rad = this.toRadians(bearing);
      x += Math.cos(rad);
      y += Math.sin(rad);
    });

    const meanRad = Math.atan2(y / bearings.length, x / bearings.length);
    return (this.toDegrees(meanRad) + 360) % 360;
  }

  /**
   * Convertit les degrés en radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Convertit les radians en degrés
   */
  private static toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }

  /**
   * Détermine si l'utilisateur se déplace dans le bon sens sur la route
   */
  static isMovingInCorrectDirection(
    userLocation: { latitude: number; longitude: number },
    previousLocation: { latitude: number; longitude: number },
    routeDirection: number,
    tolerance: number = 45 // Tolérance en degrés
  ): boolean {
    
    // Calculer la direction du mouvement de l'utilisateur
    const userBearing = this.calculateSegmentBearing(
      previousLocation,
      userLocation
    );

    // Calculer la différence d'angle
    let angleDiff = Math.abs(userBearing - routeDirection);
    if (angleDiff > 180) {
      angleDiff = 360 - angleDiff;
    }

    return angleDiff <= tolerance;
  }
}

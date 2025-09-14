import { Coordinate } from "../types/RouteTypes";

export interface RouteDirectionCalculation {
  bearing: number;
  isOnRoute: boolean;
  nearestPointIndex?: number;
  distanceToRoute?: number;
}


export class RouteDirectionService {
  
  
  static calculateRouteDirection(
    userLocation: { latitude: number; longitude: number },
    routeCoords: Coordinate[],
    threshold: number = 30
  ): RouteDirectionCalculation {
    
    if (!routeCoords || routeCoords.length < 2) {
      return { bearing: 0, isOnRoute: false };
    }

    const nearestSegment = this.findNearestRouteSegment(userLocation, routeCoords);
    
    if (!nearestSegment || nearestSegment.distance > threshold) {
      return { bearing: 0, isOnRoute: false, distanceToRoute: nearestSegment?.distance };
    }

    const segmentBearing = this.calculateSegmentBearing(
      nearestSegment.start,
      nearestSegment.end
    );

    const futureBearing = this.calculateFutureRouteDirection(
      routeCoords,
      nearestSegment.startIndex,
      100
    );

    const finalBearing = futureBearing !== null ? futureBearing : segmentBearing;

    return {
      bearing: finalBearing,
      isOnRoute: true,
      nearestPointIndex: nearestSegment.startIndex,
      distanceToRoute: nearestSegment.distance
    };
  }

  
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

  
  private static calculateFutureRouteDirection(
    routeCoords: Coordinate[],
    currentIndex: number,
    lookAheadDistance: number
  ): number | null {
    
    if (currentIndex >= routeCoords.length - 1) {
      return null;
    }

    const startPoint = routeCoords[currentIndex];
    let accumulatedDistance = 0;
    let endIndex = currentIndex + 1;

    for (let i = currentIndex + 1; i < routeCoords.length; i++) {
      const segmentDistance = this.calculateDistance(routeCoords[i - 1], routeCoords[i]);
      accumulatedDistance += segmentDistance;
      
      if (accumulatedDistance >= lookAheadDistance) {
        endIndex = i;
        break;
      }
      
      endIndex = i;
    }

    if (endIndex === currentIndex + 1 && accumulatedDistance < lookAheadDistance / 2) {
      return null;
    }

    const endPoint = routeCoords[endIndex];
    return this.calculateSegmentBearing(startPoint, endPoint);
  }

  
  static calculateDistance(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number {
    const R = 6371000;
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

  
  static calculateSmoothedRouteDirection(
    userLocation: { latitude: number; longitude: number },
    routeCoords: Coordinate[],
    smoothingDistance: number = 50
  ): RouteDirectionCalculation {
    
    const baseResult = this.calculateRouteDirection(userLocation, routeCoords);
    
    if (!baseResult.isOnRoute || baseResult.nearestPointIndex === undefined) {
      return baseResult;
    }

    const bearings: number[] = [];
    const startIndex = Math.max(0, baseResult.nearestPointIndex - 2);
    const endIndex = Math.min(routeCoords.length - 2, baseResult.nearestPointIndex + 2);

    for (let i = startIndex; i <= endIndex; i++) {
      const bearing = this.calculateSegmentBearing(routeCoords[i], routeCoords[i + 1]);
      bearings.push(bearing);
    }

    const smoothedBearing = this.calculateMeanBearing(bearings);

    return {
      ...baseResult,
      bearing: smoothedBearing
    };
  }

  
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

  
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  
  private static toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }

  
  static isMovingInCorrectDirection(
    userLocation: { latitude: number; longitude: number },
    previousLocation: { latitude: number; longitude: number },
    routeDirection: number,
    tolerance: number = 45
  ): boolean {
    
    const userBearing = this.calculateSegmentBearing(
      previousLocation,
      userLocation
    );

    let angleDiff = Math.abs(userBearing - routeDirection);
    if (angleDiff > 180) {
      angleDiff = 360 - angleDiff;
    }

    return angleDiff <= tolerance;
  }
}


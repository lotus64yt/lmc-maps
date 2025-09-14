import { NavigationStep } from '../types/RouteTypes';

export interface NavigationInstruction {
  text: string;
  icon: string;
  type: 'join' | 'turn' | 'continue' | 'roundabout' | 'uturn' | 'arrive' | 'ferry' | 'ramp' | 'fork' | 'merge' | 'lane_change' | 'waypoint';
  distance?: number;
  duration?: number;
  laneInfo?: LaneInfo;
}

export interface LaneInfo {
  lanes: Lane[];
  recommendedLanes: number[];
}

export interface Lane {
  valid: boolean;
  indications: string[];
}

export class NavigationInstructionService {
  
  private static readonly ANGLE_THRESHOLDS = {
    STRAIGHT: 10,
    SLIGHT_TURN: 30,
    REGULAR_TURN: 120,
    SHARP_TURN: 150,
    UTURN: 170
  };

  private static readonly ROAD_KEYWORDS = {
    HIGHWAY: ['autoroute', 'highway', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'],
    TUNNEL: ['tunnel', 'souterrain'],
    BRIDGE: ['pont', 'bridge', 'viaduc'],
    FERRY: ['ferry', 'bac', 'navette'],
    RAMP: ['bretelle', 'sortie', 'entrée', 'ramp', 'exit']
  };

  static generateJoinRouteInstruction(
    roadName?: string, 
    distance?: number,
    bearing?: number
  ): NavigationInstruction {
    const defaultRoadName = roadName || 'la route';
    let directionText = '';
    
    if (bearing !== undefined) {
      directionText = this.getCardinalDirection(bearing);
    }
    
    const distanceText = distance ? ` dans ${this.formatDistance(distance)}` : '';
    
    return {
      text: `Rejoindre ${defaultRoadName}${directionText}${distanceText}`,
      icon: 'merge',
      type: 'join',
      distance,
    };
  }

  static generateInstructionFromStep(
    step: NavigationStep, 
    nextStep?: NavigationStep,
    isFirstStep: boolean = false,
    userOnRoute: boolean = true,
    currentIndex: number = 0
  ): NavigationInstruction {
    
    if (isFirstStep && !userOnRoute) {
      return this.generateJoinRouteInstruction(
        step.streetName, 
        step.distance,
        this.calculateBearing(step.coordinates)
      );
    }

    const specialInstruction = this.detectSpecialManeuver(step, nextStep);
    if (specialInstruction) {
      return specialInstruction;
    }

    const osrmModifier = (step as any).osrmModifier;
    if (osrmModifier) {
const maneuverType = this.convertOSRMModifierToType(step.maneuver, osrmModifier);
      return this.generateInstructionFromManeuver(
        maneuverType, 
        step.streetName, 
        step.maneuver,
        step.distance,
        step.duration
      );
    }

    if (step.maneuver && step.maneuver !== 'straight' && step.maneuver !== 'continue') {
const originalType = this.convertOriginalManeuverToType(step.maneuver);
      if (originalType !== 'straight') {
        return this.generateInstructionFromManeuver(
          originalType, 
          step.streetName, 
          step.maneuver,
          step.distance,
          step.duration
        );
      }
    }

    let turnAngle = 0;
    if (nextStep && step.coordinates && nextStep.coordinates) {
      turnAngle = this.calculateTurnAngleImproved(step.coordinates, nextStep.coordinates);
    }

    const maneuverType = this.analyzeTurnTypeImproved(turnAngle, step.streetName, nextStep?.streetName);
    
    return this.generateInstructionFromManeuver(
      maneuverType, 
      step.streetName, 
      step.maneuver,
      step.distance,
      step.duration
    );
  }

  private static detectSpecialManeuver(
    step: NavigationStep, 
    nextStep?: NavigationStep
  ): NavigationInstruction | null {
    const streetName = step.streetName?.toLowerCase() || '';
    const maneuver = step.maneuver?.toLowerCase() || '';
    
    if (this.containsKeywords(streetName, this.ROAD_KEYWORDS.FERRY) || 
        maneuver.includes('ferry')) {
      return {
        text: `Embarquez sur le ferry${step.streetName ? ` - ${step.streetName}` : ''}`,
        icon: 'ferry',
        type: 'ferry',
        distance: step.distance,
        duration: step.duration
      };
    }

    if (this.containsKeywords(streetName, this.ROAD_KEYWORDS.RAMP) || 
        maneuver.includes('ramp') || maneuver.includes('on-ramp') || maneuver.includes('off-ramp')) {
      const isExit = maneuver.includes('off') || streetName.includes('sortie');
      return {
        text: isExit ? 
          `Prenez la sortie${step.streetName ? ` - ${step.streetName}` : ''}` :
          `Prenez la bretelle${step.streetName ? ` - ${step.streetName}` : ''}`,
        icon: isExit ? 'off-ramp' : 'on-ramp',
        type: 'ramp',
        distance: step.distance,
        duration: step.duration
      };
    }

    if (maneuver.includes('waypoint') || maneuver.includes('via')) {
      return {
        text: `Passez par ${step.streetName || 'le point de passage'}`,
        icon: 'waypoint',
        type: 'waypoint',
        distance: step.distance,
        duration: step.duration
      };
    }

    if (maneuver.includes('lane') && (maneuver.includes('change') || maneuver.includes('keep'))) {
      const direction = maneuver.includes('left') ? 'gauche' : 'droite';
      return {
        text: `Restez sur la voie de ${direction}`,
        icon: `lane-${direction}`,
        type: 'lane_change',
        distance: step.distance,
        duration: step.duration
      };
    }

    return null;
  }

  private static calculateTurnAngleImproved(currentCoords: number[], nextCoords: number[]): number {
    if (!currentCoords || !nextCoords || currentCoords.length < 4 || nextCoords.length < 4) {
      return 0;
    }

    const currentLength = currentCoords.length;
    const nextLength = nextCoords.length;
    
    const p1 = [currentCoords[currentLength - 4], currentCoords[currentLength - 3]];
    const p2 = [currentCoords[currentLength - 2], currentCoords[currentLength - 1]];
    
    const p3 = [nextCoords[0], nextCoords[1]];
    const p4 = [nextCoords[2], nextCoords[3]];

    const v1 = this.normalizeVector([p2[0] - p1[0], p2[1] - p1[1]]);
    const v2 = this.normalizeVector([p4[0] - p3[0], p4[1] - p3[1]]);

    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const det = v1[0] * v2[1] - v1[1] * v2[0];
    
    let angle = Math.atan2(det, dot) * (180 / Math.PI);
    
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
return angle;
  }

  private static normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
    if (magnitude === 0) return [0, 0];
    return [vector[0] / magnitude, vector[1] / magnitude];
  }

  private static analyzeTurnTypeImproved(
    angle: number, 
    currentStreet?: string, 
    nextStreet?: string
  ): string {
    const absAngle = Math.abs(angle);
    
    if (currentStreet && nextStreet) {
      if (this.isSameStreet(currentStreet, nextStreet) && absAngle < this.ANGLE_THRESHOLDS.SLIGHT_TURN) {
        return 'straight';
      }
    }
    
    if (absAngle < this.ANGLE_THRESHOLDS.STRAIGHT) {
      return 'straight';
    }
    if (absAngle > this.ANGLE_THRESHOLDS.UTURN) {
      return 'uturn';
    }
    
    const isLeft = angle > 0;
    
    if (absAngle < this.ANGLE_THRESHOLDS.SLIGHT_TURN) {
      return isLeft ? 'slight-left' : 'slight-right';
    }
    if (absAngle < this.ANGLE_THRESHOLDS.REGULAR_TURN) {
      return isLeft ? 'left' : 'right';
    }
    if (absAngle < this.ANGLE_THRESHOLDS.SHARP_TURN) {
      return isLeft ? 'sharp-left' : 'sharp-right';
    }
    
    return isLeft ? 'sharp-left' : 'sharp-right';
  }

  private static isSameStreet(street1: string, street2: string): boolean {
    const normalize = (str: string) => str.toLowerCase()
      .replace(/\b(rue|avenue|boulevard|place|square|road|street|drive)\b/g, '')
      .replace(/[^\w\s]/g, '')
      .trim();
    
    return normalize(street1) === normalize(street2);
  }

  private static generateInstructionFromManeuver(
    maneuverType: string, 
    streetName?: string,
    originalManeuver?: string,
    distance?: number,
    duration?: number
  ): NavigationInstruction {
    
    const street = streetName ? ` sur ${streetName}` : '';
    const distanceText = distance ? ` dans ${this.formatDistance(distance)}` : '';
    const roadTypePrefix = this.getRoadTypePrefix(streetName);
    
    switch (maneuverType) {
      case 'straight':
        return {
          text: `Continuez tout droit${street}${distanceText}`,
          icon: 'straight',
          type: 'continue',
          distance,
          duration
        };
        
      case 'slight-left':
        return {
          text: `Tournez légèrement à gauche${roadTypePrefix}${street}${distanceText}`,
          icon: 'turn-slight-left',
          type: 'turn',
          distance,
          duration
        };
        
      case 'left':
        return {
          text: `Tournez à gauche${roadTypePrefix}${street}${distanceText}`,
          icon: 'turn-left',
          type: 'turn',
          distance,
          duration
        };
        
      case 'sharp-left':
        return {
          text: `Tournez fortement à gauche${roadTypePrefix}${street}${distanceText}`,
          icon: 'turn-sharp-left',
          type: 'turn',
          distance,
          duration
        };
        
      case 'slight-right':
        return {
          text: `Tournez légèrement à droite${roadTypePrefix}${street}${distanceText}`,
          icon: 'turn-slight-right',
          type: 'turn',
          distance,
          duration
        };
        
      case 'right':
        return {
          text: `Tournez à droite${roadTypePrefix}${street}${distanceText}`,
          icon: 'turn-right',
          type: 'turn',
          distance,
          duration
        };
        
      case 'sharp-right':
        return {
          text: `Tournez fortement à droite${roadTypePrefix}${street}${distanceText}`,
          icon: 'turn-sharp-right',
          type: 'turn',
          distance,
          duration
        };
        
      case 'uturn':
        return {
          text: `Faites demi-tour${street}${distanceText}`,
          icon: 'u-turn-left',
          type: 'uturn',
          distance,
          duration
        };
        
      default:
        return this.parseOriginalManeuver(originalManeuver || '', streetName, distance, duration);
    }
  }

  private static getRoadTypePrefix(streetName?: string): string {
    if (!streetName) return '';
    
    const lowerStreet = streetName.toLowerCase();
    
    if (this.containsKeywords(lowerStreet, this.ROAD_KEYWORDS.HIGHWAY)) {
      return ' pour prendre ';
    }
    if (this.containsKeywords(lowerStreet, this.ROAD_KEYWORDS.TUNNEL)) {
      return ' pour entrer dans ';
    }
    if (this.containsKeywords(lowerStreet, this.ROAD_KEYWORDS.BRIDGE)) {
      return ' pour emprunter ';
    }
    
    return '';
  }

  private static parseOriginalManeuver(
    maneuver: string, 
    streetName?: string,
    distance?: number,
    duration?: number
  ): NavigationInstruction {
    const street = streetName ? ` sur ${streetName}` : '';
    const lowerManeuver = maneuver.toLowerCase();
    const distanceText = distance ? ` dans ${this.formatDistance(distance)}` : '';
    
    if (lowerManeuver.includes('roundabout')) {
      const exitMatch = maneuver.match(/exit[:\s]+(\d+)/i);
      const exitNumber = exitMatch ? exitMatch[1] : '';
      const exitText = exitNumber ? ` - ${this.getOrdinalNumber(parseInt(exitNumber))} sortie` : '';
      
      return {
        text: `Prenez le rond-point${exitText}${street}${distanceText}`,
        icon: 'roundabout-left',
        type: 'roundabout',
        distance,
        duration
      };
    }
    
    if (lowerManeuver.includes('merge')) {
      return {
        text: `Rejoignez${street}${distanceText}`,
        icon: 'merge',
        type: 'merge',
        distance,
        duration
      };
    }
    
    if (lowerManeuver.includes('fork')) {
      const direction = lowerManeuver.includes('left') ? 'gauche' : 'droite';
      return {
        text: `Prenez à ${direction}${street}${distanceText}`,
        icon: `fork-${direction === 'gauche' ? 'left' : 'right'}`,
        type: 'fork',
        distance,
        duration
      };
    }
    
    if (lowerManeuver.includes('arrive') || lowerManeuver.includes('destination')) {
      return {
        text: `Vous êtes arrivé${streetName ? ' à destination' : ''}`,
        icon: 'flag',
        type: 'arrive',
        distance,
        duration
      };
    }
    
    return {
      text: `Continuez${street}${distanceText}`,
      icon: 'straight',
      type: 'continue',
      distance,
      duration
    };
  }


  private static formatDistance(distance: number): string {
    if (distance < 1000) {
      return `${Math.round(distance)} m`;
    } else {
      return `${(distance / 1000).toFixed(1)} km`;
    }
  }

  private static calculateBearing(coordinates?: number[]): number | undefined {
    if (!coordinates || coordinates.length < 4) return undefined;
    
    const lat1 = coordinates[1] * Math.PI / 180;
    const lat2 = coordinates[3] * Math.PI / 180;
    const deltaLon = (coordinates[2] - coordinates[0]) * Math.PI / 180;
    
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  private static getCardinalDirection(bearing: number): string {
    const directions = [
      { min: 337.5, max: 360, text: ' vers le nord' },
      { min: 0, max: 22.5, text: ' vers le nord' },
      { min: 22.5, max: 67.5, text: ' vers le nord-est' },
      { min: 67.5, max: 112.5, text: ' vers l\'est' },
      { min: 112.5, max: 157.5, text: ' vers le sud-est' },
      { min: 157.5, max: 202.5, text: ' vers le sud' },
      { min: 202.5, max: 247.5, text: ' vers le sud-ouest' },
      { min: 247.5, max: 292.5, text: ' vers l\'ouest' },
      { min: 292.5, max: 337.5, text: ' vers le nord-ouest' }
    ];
    
    const direction = directions.find(d => bearing >= d.min && bearing < d.max);
    return direction?.text || '';
  }

  private static containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private static convertOSRMModifierToType(originalManeuver: string, osrmModifier: string): string {
    if (originalManeuver.includes('roundabout')) {
      return 'roundabout';
    }
    
    switch (osrmModifier) {
      case 'slight left':
        return 'slight-left';
      case 'left':
        return 'left';
      case 'sharp left':
        return 'sharp-left';
      case 'slight right':
        return 'slight-right';
      case 'right':
        return 'right';
      case 'sharp right':
        return 'sharp-right';
      case 'straight':
        return 'straight';
      case 'uturn':
        return 'uturn';
      default:
        return this.convertOriginalManeuverToType(originalManeuver);
    }
  }

  private static getOrdinalNumber(num: number): string {
    switch (num) {
      case 1: return 'première';
      case 2: return 'deuxième';  
      case 3: return 'troisième';
      case 4: return 'quatrième';
      case 5: return 'cinquième';
      case 6: return 'sixième';
      case 7: return 'septième';
      case 8: return 'huitième';
      case 9: return 'neuvième';
      case 10: return 'dixième';
      default: return `${num}ème`;
    }
  }

  static getEmojiFromIcon(icon: string): string {
    const emojiMap: Record<string, string> = {
      'straight': '↑',
      'turn-left': '↰', 
      'turn-right': '↱',
      'turn-slight-left': '↖',
      'turn-slight-right': '↗',
      'turn-sharp-left': '↺',
      'turn-sharp-right': '↻',
      'u-turn-left': '↶',
      'roundabout-left': '🔄',
      'merge': '🔀',
      'fork-left': '🔱',
      'fork-right': '🔱',
      'flag': '🏁',
      'ferry': '⛴️',
      'on-ramp': '🛣️',
      'off-ramp': '🛤️',
      'waypoint': '📍',
      'lane-left': '⬅️',
      'lane-right': '➡️'
    };
    
    return emojiMap[icon] || '🧭';
  }

  private static convertOriginalManeuverToType(originalManeuver: string): string {
    const lowerManeuver = originalManeuver.toLowerCase();
    
    const maneuverMap: Record<string, string> = {
      'turn-left': 'left',
      'left': 'left',
      'turn-right': 'right', 
      'right': 'right',
      'turn-slight-left': 'slight-left',
      'slight-left': 'slight-left',
      'turn-slight-right': 'slight-right',
      'slight-right': 'slight-right',
      'turn-sharp-left': 'sharp-left',
      'sharp-left': 'sharp-left',
      'turn-sharp-right': 'sharp-right',
      'sharp-right': 'sharp-right',
      'uturn': 'uturn',
      'u-turn': 'uturn',
      'continue': 'straight',
      'straight': 'straight',
      'merge': 'merge',
      'fork': 'fork',
      'roundabout': 'roundabout'
    };
    
    for (const [key, value] of Object.entries(maneuverMap)) {
      if (lowerManeuver.includes(key)) {
        return value;
      }
    }
    
    return 'straight';
  }

  static isUserOnRoute(
    userLocation: { latitude: number; longitude: number },
    routeCoordinates: number[],
    threshold: number = 50
  ): boolean {
    if (!routeCoordinates || routeCoordinates.length < 2) return false;
    
    for (let i = 0; i < routeCoordinates.length - 2; i += 2) {
      const segmentStart = {
        latitude: routeCoordinates[i + 1],
        longitude: routeCoordinates[i]
      };
      const segmentEnd = {
        latitude: routeCoordinates[i + 3],
        longitude: routeCoordinates[i + 2]
      };
      
      const distance = this.distanceToLineSegment(userLocation, segmentStart, segmentEnd);
      if (distance <= threshold) {
        return true;
      }
    }
    
    return false;
  }

  private static distanceToLineSegment(
    point: { latitude: number; longitude: number },
    lineStart: { latitude: number; longitude: number },
    lineEnd: { latitude: number; longitude: number }
  ): number {
    const A = point.latitude - lineStart.latitude;
    const B = point.longitude - lineStart.longitude;
    const C = lineEnd.latitude - lineStart.latitude;
    const D = lineEnd.longitude - lineStart.longitude;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      return this.haversineDistance(point, lineStart);
    }
    
    let param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = lineStart.latitude;
      yy = lineStart.longitude;
    } else if (param > 1) {
      xx = lineEnd.latitude;
      yy = lineEnd.longitude;
    } else {
      xx = lineStart.latitude + param * C;
      yy = lineStart.longitude + param * D;
    }

    return this.haversineDistance(point, { latitude: xx, longitude: yy });
  }

  private static haversineDistance(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number {
    const R = 6371e3;
    const φ1 = point1.latitude * Math.PI / 180;
    const φ2 = point2.latitude * Math.PI / 180;
    const Δφ = (point2.latitude - point1.latitude) * Math.PI / 180;
    const Δλ = (point2.longitude - point1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  static findClosestStep(
    userLocation: { latitude: number; longitude: number },
    steps: NavigationStep[]
  ): number {
    let closestIndex = 0;
    let minDistance = Infinity;

    steps.forEach((step, index) => {
      if (step.coordinates && step.coordinates.length >= 2) {
        let stepMinDistance = Infinity;
        
        const stepStart = {
          latitude: step.coordinates[1],
          longitude: step.coordinates[0]
        };
        
        const stepEnd = {
          latitude: step.coordinates[step.coordinates.length - 1],
          longitude: step.coordinates[step.coordinates.length - 2]
        };
        
        const distanceToStart = this.haversineDistance(userLocation, stepStart);
        const distanceToEnd = this.haversineDistance(userLocation, stepEnd);
        
        stepMinDistance = Math.min(distanceToStart, distanceToEnd);
        
        if (step.coordinates.length > 4) {
          const midIndex = Math.floor((step.coordinates.length - 2) / 2);
          const stepMid = {
            latitude: step.coordinates[midIndex + 1],
            longitude: step.coordinates[midIndex]
          };
          const distanceToMid = this.haversineDistance(userLocation, stepMid);
          stepMinDistance = Math.min(stepMinDistance, distanceToMid);
        }
        
        if (stepMinDistance < minDistance) {
          minDistance = stepMinDistance;
          closestIndex = index;
        }
      }
    });

    return closestIndex;
  }
}

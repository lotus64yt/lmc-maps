import { TravelTimeService, TransportMode } from '@/services/TravelTimeService';

/**
 * Exemple d'utilisation du TravelTimeService
 */
export class TravelTimeExamples {
  
  /**
   * Exemple simple : calculer le temps entre deux points
   */
  static async basicExample() {
    const origin = { latitude: 48.8566, longitude: 2.3522 }; // Paris
    const destination = { latitude: 48.8606, longitude: 2.3376 }; // Louvre
    
    try {
      const result = await TravelTimeService.calculateTravelTime({
        origin,
        destination,
        mode: 'walking'
      });
      
      console.log(`Temps de marche: ${Math.round(result.duration / 60)} minutes`);
      console.log(`Distance: ${Math.round(result.distance)} mètres`);
    } catch (error) {
      console.error('Erreur:', error);
    }
  }
  
  /**
   * Exemple avec waypoints multiples
   */
  static async multiStepExample() {
    const userLocation = { latitude: 48.8566, longitude: 2.3522 };
    const waypoints = [
      { latitude: 48.8606, longitude: 2.3376 }, // Louvre
      { latitude: 48.8584, longitude: 2.2945 }, // Tour Eiffel
      { latitude: 48.8738, longitude: 2.2950 }  // Arc de Triomphe
    ];
    
    try {
      const result = await TravelTimeService.calculateMultiStepTravelTime(
        userLocation,
        waypoints,
        'driving'
      );console.log(`- Durée: ${Math.round(result.totalDuration / 60)} minutes`);
      console.log(`- Distance: ${Math.round(result.totalDistance / 1000)} km`);
      
      result.segments.forEach((segment, index) => {
        console.log(`Segment ${index + 1}: ${Math.round(segment.duration / 60)}min, ${Math.round(segment.distance)}m`);
      });
    } catch (error) {
      console.error('Erreur:', error);
    }
  }
  
  /**
   * Exemple de comparaison des modes de transport
   */
  static async compareModesExample() {
    const origin = { latitude: 48.8566, longitude: 2.3522 };
    const destination = { latitude: 48.8606, longitude: 2.3376 };
    
    try {
      const comparison = await TravelTimeService.compareTravelModes(origin, destination);Object.entries(comparison).forEach(([mode, result]) => {
        const minutes = Math.round(result.duration / 60);
        const meters = Math.round(result.distance);});
    } catch (error) {
      console.error('Erreur:', error);
    }
  }
  
  /**
   * Exemple avec trafic (uniquement pour driving)
   */
  static async trafficExample() {
    const origin = { latitude: 48.8566, longitude: 2.3522 };
    const destination = { latitude: 48.8606, longitude: 2.3376 };
    
    try {
      const result = await TravelTimeService.calculateTravelTimeWithTraffic({
        origin,
        destination,
        mode: 'driving'
      });
      
      const normalTime = Math.round(result.duration / 60);
      const trafficTime = result.durationInTraffic ? Math.round(result.durationInTraffic / 60) : normalTime;console.log(`Temps avec trafic: ${trafficTime} minutes`);
      
      if (trafficTime > normalTime) {}
    } catch (error) {
      console.error('Erreur:', error);
    }
  }
}

/**
 * Utilitaires pour formatter les résultats du TravelTimeService
 */
export class TravelTimeFormatter {
  
  /**
   * Formate un temps en minutes et heures
   */
  static formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    
    if (minutes < 60) {
      return `${minutes} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    
    return `${hours}h ${remainingMinutes}min`;
  }
  
  /**
   * Formate une distance en mètres ou kilomètres
   */
  static formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    
    const kilometers = meters / 1000;
    
    if (kilometers < 10) {
      return `${kilometers.toFixed(1)} km`;
    }
    
    return `${Math.round(kilometers)} km`;
  }
  
  /**
   * Formate une vitesse moyenne
   */
  static formatSpeed(distance: number, duration: number): string {
    if (duration === 0) return '0 km/h';
    
    const speedKmh = (distance / 1000) / (duration / 3600);
    return `${Math.round(speedKmh)} km/h`;
  }
  
  /**
   * Génère un résumé textuel d'un itinéraire
   */
  static generateRouteSummary(
    totalDistance: number, 
    totalDuration: number, 
    mode: TransportMode
  ): string {
    const distance = this.formatDistance(totalDistance);
    const duration = this.formatDuration(totalDuration);
    const speed = this.formatSpeed(totalDistance, totalDuration);
    
    const modeLabels = {
      walking: 'à pied',
      bicycling: 'à vélo',
      driving: 'en voiture',
      transit: 'en transport public'
    };
    
    const modeLabel = modeLabels[mode] || mode;
    
    return `${distance} ${modeLabel} (${duration}, vitesse moyenne ${speed})`;
  }
}

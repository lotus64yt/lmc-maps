import { TravelTimeService, TransportMode } from "@/services/TravelTimeService";

export class TravelTimeExamples {
  static async basicExample() {
    const origin = { latitude: 48.8566, longitude: 2.3522 };
    const destination = { latitude: 48.8606, longitude: 2.3376 };

    try {
      const result = await TravelTimeService.calculateTravelTime({
        origin,
        destination,
        mode: "walking",
      });
    } catch (error) {
    }
  }

  static async multiStepExample() {
    const userLocation = { latitude: 48.8566, longitude: 2.3522 };
    const waypoints = [
      { latitude: 48.8606, longitude: 2.3376 },
      { latitude: 48.8584, longitude: 2.2945 },
      { latitude: 48.8738, longitude: 2.295 },
    ];

    try {
      const result = await TravelTimeService.calculateMultiStepTravelTime(
        userLocation,
        waypoints,
        "driving"
      );

      result.segments.forEach((segment, index) => {});
    } catch (error) {
    }
  }

  static async compareModesExample() {
    const origin = { latitude: 48.8566, longitude: 2.3522 };
    const destination = { latitude: 48.8606, longitude: 2.3376 };

    try {
      const comparison = await TravelTimeService.compareTravelModes(
        origin,
        destination
      );
    } catch (error) {
    }
  }

  static async trafficExample() {
    const origin = { latitude: 48.8566, longitude: 2.3522 };
    const destination = { latitude: 48.8606, longitude: 2.3376 };

    try {
      const result = await TravelTimeService.calculateTravelTimeWithTraffic({
        origin,
        destination,
        mode: "driving",
      });

      const normalTime = Math.round(result.duration / 60);
      const trafficTime = result.durationInTraffic
        ? Math.round(result.durationInTraffic / 60)
        : normalTime;

      if (trafficTime > normalTime) {
      }
    } catch (error) {
    }
  }
}

export class TravelTimeFormatter {
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

  static formatSpeed(distance: number, duration: number): string {
    if (duration === 0) return "0 km/h";

    const speedKmh = distance / 1000 / (duration / 3600);
    return `${Math.round(speedKmh)} km/h`;
  }

  static generateRouteSummary(
    totalDistance: number,
    totalDuration: number,
    mode: TransportMode
  ): string {
    const distance = this.formatDistance(totalDistance);
    const duration = this.formatDuration(totalDuration);
    const speed = this.formatSpeed(totalDistance, totalDuration);

    const modeLabels = {
      walking: "à pied",
      bicycling: "à vélo",
      driving: "en voiture",
      transit: "en transport public",
    };

    const modeLabel = modeLabels[mode] || mode;

    return `${distance} ${modeLabel} (${duration}, vitesse moyenne ${speed})`;
  }
}

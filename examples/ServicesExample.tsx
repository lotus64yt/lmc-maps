import React, { useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import { useLocationService } from '../services/LocationService';
import { useRouteService, RouteCalculationService } from '../services/RouteService';

/**
 * Exemple d'utilisation des services séparés
 */
export default function ServicesExample() {
  const locationService = useLocationService();
  const routeService = useRouteService();

  // Démarrer le suivi de localisation au montage
  useEffect(() => {
    locationService.startLocationTracking();
    
    return () => {
      locationService.stopLocationTracking();
    };
  }, []);

  const calculateRoute = async () => {
    if (!locationService.location) {
      console.log("Position non disponible");
      return;
    }

    const start = {
      latitude: locationService.location.latitude,
      longitude: locationService.location.longitude
    };

    const destination = {
      latitude: start.latitude + 0.01, // 1km au nord approximativement
      longitude: start.longitude
    };

    const success = await routeService.getRoute(start, destination, 'driving');
    console.log(success ? "Route calculée" : "Erreur de calcul");
  };

  const calculateRouteWithStaticService = async () => {
    if (!locationService.location) {
      console.log("Position non disponible");
      return;
    }

    const start = {
      latitude: locationService.location.latitude,
      longitude: locationService.location.longitude
    };

    const destination = {
      latitude: start.latitude + 0.01,
      longitude: start.longitude
    };

    const result = await RouteCalculationService.calculateRoute(start, destination, 'walking');
    
    if (result) {
      console.log(`Route: ${result.duration}min, ${result.distance}m`);
      console.log(`Instructions: ${result.instructions.length} étapes`);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      {/* Informations de localisation */}
      <Text>Localisation:</Text>
      {locationService.location ? (
        <Text>
          Lat: {locationService.location.latitude.toFixed(6)}, 
          Lon: {locationService.location.longitude.toFixed(6)}
        </Text>
      ) : (
        <Text>Position non disponible</Text>
      )}
      
      <Text>Heading: {locationService.heading.toFixed(1)}°</Text>

      {/* Informations de route */}
      <Text style={{ marginTop: 20 }}>Route:</Text>
      {routeService.routeInfo ? (
        <View>
          <Text>Durée: {routeService.routeInfo.duration} min</Text>
          <Text>Distance: {routeService.routeInfo.distance} m</Text>
          <Text>Instruction: {routeService.routeInfo.instruction}</Text>
          <Text>Points: {routeService.routeCoords.length}</Text>
        </View>
      ) : (
        <Text>Aucune route calculée</Text>
      )}

      {/* Boutons d'action */}
      <Button 
        title="Calculer route (service avec état)" 
        onPress={calculateRoute}
        disabled={!locationService.location || routeService.isCalculating}
      />
      
      <Button 
        title="Calculer route (service statique)" 
        onPress={calculateRouteWithStaticService}
        disabled={!locationService.location}
      />
      
      <Button 
        title="Effacer route" 
        onPress={routeService.clearRoute}
      />
    </View>
  );
}

/**
 * Exemple d'utilisation du service statique uniquement
 */
export class RouteCalculationExample {
  
  static async exampleUsage() {
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const louvre = { latitude: 48.8606, longitude: 2.3376 };
    
    // Calcul simple
    const route = await RouteCalculationService.calculateRoute(paris, louvre, 'walking');
    
    if (route) {
      console.log(`Route à pied: ${route.duration}min, ${route.distance}m`);
      console.log(`${route.coordinates.length} points sur la route`);
      console.log(`Première instruction: ${route.instructions[0]}`);
    }
    
    // Calcul de distance à vol d'oiseau
    const distance = RouteCalculationService.calculateDistance(paris, louvre);
    console.log(`Distance à vol d'oiseau: ${Math.round(distance)}m`);
    
    // Calcul de direction
    const bearing = RouteCalculationService.calculateBearing(paris, louvre);
    console.log(`Direction: ${Math.round(bearing)}°`);
  }
}

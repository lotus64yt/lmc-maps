import React from "react";
import { Animated, View } from "react-native";
import * as Location from "expo-location";
import ArrowSVG from "./ArrowSVG";

interface UserLocationMarkerProps {
  location: Location.LocationObjectCoords;
  headingAnim: Animated.Value;
  compassMode: 'north' | 'heading';
  mapHeading?: number;
  // Nouvelles props pour la direction de la route
  routeDirection?: {
    bearing: number;
    isOnRoute: boolean;
  };
  isNavigating?: boolean;
  color?: string; // Couleur du marker (bleu par défaut, gris si position ancienne)
}

export default function UserLocationMarker({
  location,
  headingAnim,
  compassMode,
  mapHeading = 0,
  routeDirection,
  isNavigating = false,
  color = '#007AFF',
}: UserLocationMarkerProps) {
  
  // En mode navigation, utiliser la direction de la route si disponible et l'utilisateur est sur la route
  const shouldUseRouteDirection = isNavigating && 
                                  routeDirection && 
                                  routeDirection.isOnRoute;

  // Fonction pour calculer la rotation appropriée
  const getRotationTransform = () => {
    // Préparer un heading basé sur le mouvement (si disponible)
    const numericLocationHeading =
      location && typeof (location as any).heading === "number" && !isNaN((location as any).heading)
        ? (location as any).heading
        : undefined;

    const isMoving =
      location && typeof (location as any).speed === "number" && (location as any).speed > 0.5; // seuil en m/s

    // Si on est en navigation, on veut que la carte tourne pour aligner la direction
    // tandis que la flèche reste visuellement orientée vers le haut de l'appareil.
    if (isNavigating) {
      // Annuler la rotation de la carte pour que la flèche reste verticale à l'écran
      // (on ajoute 180° pour compenser l'orientation de l'icône si nécessaire)
      return `${180 - mapHeading}deg`;
    }

    if (shouldUseRouteDirection) {
      // Mode navigation avec direction de route (mais si isNavigating === false, on veut
      // toujours que la flèche suive la direction de la route)
      const routeBearing = routeDirection!.bearing;

      if (compassMode === 'heading') {
        // Compenser la rotation de la carte
        return `${routeBearing - mapHeading + 180}deg`;
      } else {
        // Mode nord : utiliser directement la direction de la route
        return `${routeBearing + 180}deg`;
      }
    } else {
      // Mode normal : utiliser la boussole/heading ou le cap de mouvement en mode 'north'
      if (compassMode === 'heading') {
        // La flèche doit pointer dans la direction absolue du heading,
        // mais compensée par la rotation de la carte
        return headingAnim.interpolate({
          inputRange: [0, 360],
          outputRange: [`${180 - mapHeading}deg`, `${540 - mapHeading}deg`],
        });
      } else {
        // Mode nord : si l'appareil se déplace, utiliser le cap de mouvement (location.heading)
        // sinon retomber sur le magnétomètre animé
        if (numericLocationHeading !== undefined && isMoving) {
          return `${numericLocationHeading + 180}deg`;
        }

        // Mode normal, la flèche suit juste le heading magnétique
        return headingAnim.interpolate({
          inputRange: [0, 360],
          outputRange: ["180deg", "540deg"],
        });
      }
    }
  };

  // Render only the view contents; the parent (MapContainer) should wrap this
  // component into a Mapbox `PointAnnotation` so it is visible on the map.
  return isNavigating ? (
    // Blue (or gray) background ring with rotating arrow on top
    <View
      collapsable={false}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: color,
          borderWidth: 3,
          borderColor: 'white',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            transform: [
              {
                rotate: getRotationTransform(),
              },
            ],
          }}
        >
          <ArrowSVG width={20} height={20} color="white" />
        </Animated.View>
      </View>
    </View>
  ) : (
    // Empty ring when not navigating (no inner dot)
    <View
      collapsable={false}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 3,
          borderColor: color,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

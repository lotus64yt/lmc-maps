import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import { Animated, Platform } from "react-native";

export interface LocationService {
  location: Location.LocationObjectCoords | null;
  heading: number;
  headingAnimated: Animated.Value;
  headingAnim: Animated.Value;
  currentHeading: number;
  startLocationTracking: () => Promise<void>;
  stopLocationTracking: () => void;
  requestLocationPermission: () => Promise<boolean>;
}

class HeadingFilter {
  private filteredHeading = 0;
  private alpha = 0.15;
  private threshold = 1.5;
  private initialized = false;

  update(newHeading: number): number {
    if (!this.initialized) {
      this.filteredHeading = newHeading;
      this.initialized = true;
      return this.filteredHeading;
    }

    const diff = this.angleDifference(newHeading, this.filteredHeading);

    if (Math.abs(diff) > this.threshold) {
      this.filteredHeading = this.normalizeAngle(
        this.filteredHeading + diff * this.alpha
      );
    }

    return this.filteredHeading;
  }

  private angleDifference(a: number, b: number): number {
    let diff = a - b;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    return diff;
  }

  private normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
  }

  reset(heading: number) {
    this.filteredHeading = heading;
    this.initialized = true;
  }
}

export function useLocationService(): LocationService {
  const [location, setLocation] =
    useState<Location.LocationObjectCoords | null>(null);
  const [heading, setHeading] = useState(0);
  const headingAnimated = useRef(new Animated.Value(0)).current;

  const headingFilter = useRef(new HeadingFilter()).current;
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const magnetometerSub = useRef<any>(null);
  const lastUpdate = useRef(0);
  const animationInProgress = useRef(false);
  const lastAnimatedValue = useRef(0);

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    } catch {
      return false;
    }
  };

  function calculateHeading(x: number, y: number, z: number): number {
    // Calculer l'angle avec atan2 et inverser x pour corriger est/ouest
    let heading = Math.atan2(-x, y) * (180 / Math.PI);

    // Normaliser pour avoir 0-360°
    heading = (heading + 360) % 360;

    return heading;
  }

  function updateHeadingSmooth(newHeading: number) {
    const now = Date.now();

    if (now - lastUpdate.current < 100) return; // Augmenter l'intervalle à 100ms
    lastUpdate.current = now;

    const filteredHeading = headingFilter.update(newHeading);
    
    const currentAnimatedValue = lastAnimatedValue.current;
    let targetValue = filteredHeading;

    // Trouver le chemin le plus court pour l'animation
    let diff1 = targetValue - currentAnimatedValue;
    let diff2 = targetValue - currentAnimatedValue + 360;
    let diff3 = targetValue - currentAnimatedValue - 360;

    let bestDiff = diff1;
    if (Math.abs(diff2) < Math.abs(bestDiff)) bestDiff = diff2;
    if (Math.abs(diff3) < Math.abs(bestDiff)) bestDiff = diff3;

    const newAnimatedValue = currentAnimatedValue + bestDiff;

    if (Math.abs(bestDiff) < 2) return; // Réduire le seuil de 1 à 2 degrés

    console.log("🧭 Mise à jour du cap:", filteredHeading.toFixed(1), "°");
    setHeading(filteredHeading);
    lastAnimatedValue.current = newAnimatedValue;

    if (!animationInProgress.current) {
      animationInProgress.current = true;
      Animated.timing(headingAnimated, {
        toValue: newAnimatedValue,
        duration: 300, // Augmenter la durée pour une animation plus fluide
        useNativeDriver: true,
      }).start(() => {
        animationInProgress.current = false;
      });
    }
  }

  const startLocationTracking = async () => {const granted = await requestLocationPermission();
    if (!granted) {
      console.error("❌ Permissions de localisation refusées");
      return;
    }

    try {// Essayer plusieurs modes pour obtenir la position initiale
      let initialPosition;
      const accuracyModes = [
        { name: "BestForNavigation", mode: Location.Accuracy.BestForNavigation },
        { name: "High", mode: Location.Accuracy.High },
        { name: "Balanced", mode: Location.Accuracy.Balanced },
        { name: "Low", mode: Location.Accuracy.Low },
      ];
      
      for (const { name, mode } of accuracyModes) {
        try {initialPosition = await Location.getCurrentPositionAsync({
            accuracy: mode,
            timeInterval: 5000,
          });setLocation(initialPosition.coords);
          break;
        } catch (modeError) {if (name === "Low") {
            // Si même le mode Low échoue, essayer avec la dernière position connue
            try {
              const lastKnown = await Location.getLastKnownPositionAsync({
                maxAge: 600000, // 10 minutes
              });
              if (lastKnown) {setLocation(lastKnown.coords);
                initialPosition = lastKnown;
              }
            } catch (lastKnownError) {
              console.error("❌ Impossible d'obtenir la dernière position connue:", lastKnownError);
            }
          }
        }
      }

      if (!initialPosition) {
        throw new Error("Impossible d'obtenir une position avec tous les modes de précision");
      }locationSub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 1,
          timeInterval: 1000,
        },
        (loc) => {setLocation(loc.coords);
        }
      );// Vérifier la disponibilité du magnétomètre
      const isAvailable = await Magnetometer.isAvailableAsync();if (!isAvailable) {
        console.warn("⚠️ Magnétomètre non disponible sur cet appareil");
        // Continuer sans le cap magnétique
        return;
      }

      Magnetometer.setUpdateInterval(100); // Réduire la fréquence à 100ms pour de meilleures performances

      magnetometerSub.current = Magnetometer.addListener(({ x, y, z }) => {
        const rawHeading = calculateHeading(x, y, z);
        updateHeadingSmooth(rawHeading);
      });} catch (error) {
      console.error("❌ Erreur lors du démarrage du suivi:", error);
      
      // Essayer une approche de récupération avec un mode plus permissif
      try {const fallbackPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest,
          timeInterval: 15000, // 15 secondes de timeout
        });setLocation(fallbackPosition.coords);
        
        // Essayer de démarrer le suivi avec des paramètres moins exigeants
        locationSub.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (loc) => setLocation(loc.coords)
        );} catch (fallbackError) {
        console.error("❌ Échec de la récupération:", fallbackError);
        
        // Dernier recours: essayer de démarrer le suivi sans position initiale
        try {locationSub.current = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Low,
              distanceInterval: 10,
              timeInterval: 5000,
            },
            (loc) => {setLocation(loc.coords);
            }
          );// Démarrer le magnétomètre même sans position initialeconst isAvailable = await Magnetometer.isAvailableAsync();
          console.log("🧭 Magnétomètre disponible (récupération):", isAvailable);
          
          if (isAvailable) {
            Magnetometer.setUpdateInterval(100);
            magnetometerSub.current = Magnetometer.addListener(({ x, y, z }) => {
              const rawHeading = calculateHeading(x, y, z);
              updateHeadingSmooth(rawHeading);
            });
          } else {
            console.warn("⚠️ Magnétomètre non disponible - pas de cap magnétique");
          }
          
          return; // Sortir sans erreur
        } catch (watchError) {
          console.error("❌ Impossible de démarrer même le suivi:", watchError);
        }
        
        // L'erreur sera visible dans l'interface utilisateur
        throw new Error(`Impossible d'obtenir votre position. Essayez de redémarrer l'application ou vérifiez que d'autres applications peuvent accéder à votre GPS. Erreur technique: ${error.message}`);
      }
    }
  };

  const stopLocationTracking = () => {
    locationSub.current?.remove();
    locationSub.current = null;

    magnetometerSub.current?.remove();
    magnetometerSub.current = null;
  };

  useEffect(() => {
    // Démarrer le magnétomètre immédiatement au montage du composant
    const initMagnetometer = async () => {
      try {
        const isAvailable = await Magnetometer.isAvailableAsync();if (isAvailable) {
          Magnetometer.setUpdateInterval(100);
          magnetometerSub.current = Magnetometer.addListener(({ x, y, z }) => {
            const rawHeading = calculateHeading(x, y, z);
            updateHeadingSmooth(rawHeading);
          });} else {
          console.warn("⚠️ Magnétomètre non disponible sur cet appareil");
        }
      } catch (error) {
        console.error("❌ Erreur lors de l'initialisation du magnétomètre:", error);
      }
    };

    initMagnetometer();

    return () => stopLocationTracking();
  }, []);

  return {
    location,
    heading,
    headingAnimated,
    headingAnim: headingAnimated,
    currentHeading: heading,
    startLocationTracking,
    stopLocationTracking,
    requestLocationPermission,
  };
}

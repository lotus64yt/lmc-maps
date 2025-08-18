import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SpeedLimitService } from '../services/SpeedLimitService';
import * as Location from 'expo-location';

interface SpeedLimitIndicatorProps {
  visible: boolean;
  currentLocation?: { latitude: number; longitude: number } | null;
}

export default function SpeedLimitIndicator({ visible, currentLocation }: SpeedLimitIndicatorProps) {
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const [speedLimit, setSpeedLimit] = useState<string | null>(null);
  const [isOverLimit, setIsOverLimit] = useState(false);
  
  // Animation pour le clignotement
  const blinkAnim = useRef(new Animated.Value(1)).current;

  // Surveiller la vitesse en temps réel
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    
    if (visible) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.BestForNavigation,
              timeInterval: 1000,
              distanceInterval: 5,
            },
            (location) => {
              if (location.coords.speed !== null) {
                const speedKmh = Math.max(0, location.coords.speed * 3.6); // m/s -> km/h
                setCurrentSpeed(speedKmh);
              }
            }
          );
        }
      })();
    }

    return () => {
      subscription?.remove();
    };
  }, [visible]);

  // Récupérer la limite de vitesse quand la position change
  useEffect(() => {
    if (visible && currentLocation) {
      SpeedLimitService.getSpeedLimit(currentLocation.latitude, currentLocation.longitude)
        .then(setSpeedLimit)
        .catch(() => setSpeedLimit(null));
    }
  }, [visible, currentLocation]);

  // Vérifier si on dépasse la limite
  useEffect(() => {
    if (currentSpeed !== null && speedLimit) {
      const limit = parseInt(speedLimit);
      if (!isNaN(limit)) {
        const isOver = currentSpeed > limit + 2; // Tolérance de 2 km/h
        setIsOverLimit(isOver);
      } else {
        setIsOverLimit(false);
      }
    } else {
      setIsOverLimit(false);
    }
  }, [currentSpeed, speedLimit]);

  // Animation de clignotement quand on dépasse
  useEffect(() => {
    if (isOverLimit) {
      const blink = () => {
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start(() => {
          if (isOverLimit) blink(); // Continue si toujours au-dessus
        });
      };
      blink();
    } else {
      blinkAnim.setValue(1); // Arrêter le clignotement
    }
  }, [isOverLimit, blinkAnim]);

  if (!visible || currentSpeed === null) return null;

  const speedLimitNum = speedLimit ? parseInt(speedLimit) : null;

  return (
    <View style={styles.container}>
      {/* Affichage vitesse actuelle */}
      <Animated.View style={[
        styles.speedContainer,
        isOverLimit && { opacity: blinkAnim }
      ]}>
        <Text style={[
          styles.currentSpeed,
          isOverLimit && styles.overLimitSpeed
        ]}>
          {Math.round(currentSpeed)}
        </Text>
        <Text style={styles.kmhLabel}>km/h</Text>
      </Animated.View>

      {/* Limite de vitesse (toujours affichée si disponible) */}
      {speedLimitNum && (
        <View style={styles.limitContainer}>
          <View style={styles.speedLimitSign}>
            <Text style={styles.limitSpeed}>{speedLimitNum}</Text>
          </View>
        </View>
      )}

      {/* Panneau d'alerte (seulement si dépassement) */}
      {isOverLimit && speedLimitNum && (
        <Animated.View style={[styles.warningPanel, { opacity: blinkAnim }]}>
          <Icon name="warning" size={16} color="#FF3B30" />
          <Text style={styles.warningText}>Limite dépassée!</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative', // Position relative par rapport au parent NavigationGuidance
    alignItems: 'flex-end', // Aligné à droite
    paddingRight: 12,
    paddingTop: 8, // Espacement avec le bandeau du dessus
  },
  speedContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderTopLeftRadius: 8, // Redonner les arrondis du haut
    borderTopRightRadius: 8, 
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    marginBottom: 6,
    width: 80, // Largeur fixe
    flexDirection: 'row',
    justifyContent: 'center',
  },
  currentSpeed: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 2,
  },
  overLimitSpeed: {
    color: '#FF3B30',
  },
  kmhLabel: {
    fontSize: 10,
    color: '#666',
    alignSelf: 'flex-end',
    marginBottom: 1,
  },
  limitContainer: {
    marginBottom: 6,
  },
  speedLimitSign: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  limitSpeed: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  warningPanel: {
    backgroundColor: '#FF3B30',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  warningText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },
});

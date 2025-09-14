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
  
  const blinkAnim = useRef(new Animated.Value(1)).current;

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
                const speedKmh = Math.max(0, location.coords.speed * 3.6);
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

  useEffect(() => {
    if (visible && currentLocation) {
      SpeedLimitService.getSpeedLimit(currentLocation.latitude, currentLocation.longitude)
        .then(setSpeedLimit)
        .catch(() => setSpeedLimit(null));
    }
  }, [visible, currentLocation]);

  useEffect(() => {
    if (currentSpeed !== null && speedLimit) {
      const limit = parseInt(speedLimit);
      if (!isNaN(limit)) {
        const isOver = currentSpeed > limit + 2;
        setIsOverLimit(isOver);
      } else {
        setIsOverLimit(false);
      }
    } else {
      setIsOverLimit(false);
    }
  }, [currentSpeed, speedLimit]);

  useEffect(() => {
    if (isOverLimit) {
      const blink = () => {
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start(() => {
          if (isOverLimit) blink();
        });
      };
      blink();
    } else {
      blinkAnim.setValue(1);
    }
  }, [isOverLimit, blinkAnim]);

  if (!visible || currentSpeed === null) return null;

  const speedLimitNum = speedLimit ? parseInt(speedLimit) : null;

  return (
    <View style={styles.container}>
      {}
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

      {}
      {speedLimitNum && (
        <View style={styles.limitContainer}>
          <View style={styles.speedLimitSign}>
            <Text style={styles.limitSpeed}>{speedLimitNum}</Text>
          </View>
        </View>
      )}

      {}
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
    position: 'relative',
    alignItems: 'flex-end',
    paddingRight: 12,
    paddingTop: 8,
  },
  speedContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderTopLeftRadius: 8,
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
    width: 80,
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


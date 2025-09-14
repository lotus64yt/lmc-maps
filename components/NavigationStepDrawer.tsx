import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  Vibration
} from "react-native";
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { NavigationStep } from '../types/RouteTypes';
import { formatDistance, formatDurationFromSeconds } from '../utils/formatUtils';

interface NavigationStepDrawerProps {
  visible: boolean;
  step: NavigationStep | null;
  stepIndex: number;
  totalSteps: number;
  onClose: () => void;
  isCurrentStep?: boolean;
  isCompletedStep?: boolean;
}

const { height: screenHeight } = Dimensions.get('window');
const DRAWER_HEIGHT = screenHeight * 0.35;

export default function NavigationStepDrawer({
  visible,
  step,
  stepIndex,
  totalSteps,
  onClose,
  isCurrentStep = false,
  isCompletedStep = false,
}: NavigationStepDrawerProps) {
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;

  const handleCloseWithVibration = () => {
    Vibration.vibrate(50);
    onClose();
  };

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: screenHeight - DRAWER_HEIGHT,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    } else {
      Animated.spring(translateY, {
        toValue: screenHeight,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    }
  }, [visible]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
    },
    onPanResponderMove: (evt, gestureState) => {
      const newValue = screenHeight - DRAWER_HEIGHT + gestureState.dy;
      if (newValue >= screenHeight - DRAWER_HEIGHT && newValue <= screenHeight) {
        translateY.setValue(newValue);
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      const threshold = DRAWER_HEIGHT / 3;
      if (gestureState.dy > threshold) {
        onClose();
      } else {
        Animated.spring(translateY, {
          toValue: screenHeight - DRAWER_HEIGHT,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      }
    },
  });

  const getManeuverIcon = (maneuver: string): string => {
    const maneuverLower = maneuver.toLowerCase();
    
    if (maneuverLower.includes('turn-right') || maneuverLower.includes('right')) {
      return 'turn-right';
    } else if (maneuverLower.includes('turn-left') || maneuverLower.includes('left')) {
      return 'turn-left';
    } else if (maneuverLower.includes('straight') || maneuverLower.includes('continue')) {
      return 'straight';
    } else if (maneuverLower.includes('u-turn')) {
      return 'u-turn-left';
    } else if (maneuverLower.includes('merge')) {
      return 'merge-type';
    } else if (maneuverLower.includes('roundabout')) {
      return 'roundabout-left';
    } else if (maneuverLower.includes('exit')) {
      return 'exit-to-app';
    } else if (maneuverLower.includes('arrive') || maneuverLower.includes('destination')) {
      return 'place';
    }
    
    return 'navigation';
  };

  const getManeuverColor = (): string => {
    if (isCompletedStep) return '#4CAF50';
    if (isCurrentStep) return '#007AFF';
    return '#666';
  };

  const getStepStatus = (): string => {
    if (isCompletedStep) return 'Étape complétée';
    if (isCurrentStep) return 'Étape actuelle';
    return 'Étape à venir';
  };

  const getDirectionText = (direction?: string): string => {
    if (!direction) return '';
    
    const directions: { [key: string]: string } = {
      'north': 'Nord',
      'south': 'Sud',
      'east': 'Est',
      'west': 'Ouest',
      'northeast': 'Nord-Est',
      'northwest': 'Nord-Ouest',
      'southeast': 'Sud-Est',
      'southwest': 'Sud-Ouest'
    };
    
    return directions[direction.toLowerCase()] || direction;
  };

  if (!visible || !step) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.header}>
        <View style={styles.handle} />
        <TouchableOpacity onPress={handleCloseWithVibration} style={styles.closeButton}>
          <Icon name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stepContainer}>
          {}
          <View style={styles.stepHeader}>
            <View style={[styles.maneuverIconContainer, { backgroundColor: getManeuverColor() + '20' }]}>
              <Icon 
                name={getManeuverIcon(step.maneuver) as any} 
                size={32} 
                color={getManeuverColor()} 
              />
            </View>
            <View style={styles.stepHeaderText}>
              <Text style={styles.stepNumber}>
                Étape {stepIndex + 1} sur {totalSteps}
              </Text>
              <Text style={[styles.stepStatus, { color: getManeuverColor() }]}>
                {getStepStatus()}
              </Text>
            </View>
          </View>

          {}
          <View style={styles.instructionContainer}>
            <Text style={styles.instruction}>{step.instruction}</Text>
          </View>

          {}
          <View style={styles.detailsContainer}>
            {step.streetName && (
              <View style={styles.detailRow}>
                <Icon name={"road" as any} size={20} color="#666" />
                <Text style={styles.detailLabel}>Rue:</Text>
                <Text style={styles.detailValue}>{step.streetName}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Icon name="straighten" size={20} color="#666" />
              <Text style={styles.detailLabel}>Distance:</Text>
              <Text style={styles.detailValue}>{formatDistance(step.distance)}</Text>
            </View>

            <View style={styles.detailRow}>
              <Icon name="schedule" size={20} color="#666" />
              <Text style={styles.detailLabel}>Durée:</Text>
              <Text style={styles.detailValue}>{formatDurationFromSeconds(step.duration)}</Text>
            </View>

            {step.direction && (
              <View style={styles.detailRow}>
                <Icon name="explore" size={20} color="#666" />
                <Text style={styles.detailLabel}>Direction:</Text>
                <Text style={styles.detailValue}>{getDirectionText(step.direction)}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Icon name="my-location" size={20} color="#666" />
              <Text style={styles.detailLabel}>Coordonnées:</Text>
              <Text style={styles.coordinatesValue}>
                {step.coordinates[1].toFixed(6)}, {step.coordinates[0].toFixed(6)}
              </Text>
            </View>
          </View>

          {}
          <View style={styles.maneuverContainer}>
            <Text style={styles.maneuverTitle}>Type de manoeuvre:</Text>
            <Text style={styles.maneuverText}>{step.maneuver}</Text>
          </View>

          {}
          <View style={styles.progressContainer}>
            <Text style={styles.progressTitle}>Progression de l'itinéraire</Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${((stepIndex + (isCurrentStep ? 0.5 : isCompletedStep ? 1 : 0)) / totalSteps) * 100}%`,
                    backgroundColor: getManeuverColor()
                  }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {isCompletedStep ? 'Terminé' : isCurrentStep ? 'En cours' : 'À venir'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#C7C7CC',
    borderRadius: 2,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 8,
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    paddingVertical: 20,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  maneuverIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stepHeaderText: {
    flex: 1,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  stepStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  instructionContainer: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  instruction: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    lineHeight: 24,
    textAlign: 'center',
  },
  detailsContainer: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginLeft: 12,
    marginRight: 12,
    minWidth: 80,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  coordinatesValue: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: 'monospace',
    flex: 1,
  },
  maneuverContainer: {
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  maneuverTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  maneuverText: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
  },
});

export { NavigationStepDrawer };


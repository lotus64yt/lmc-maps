import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  FlatList,
} from "react-native";
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { NavigationStep } from '../types/RouteTypes';
import { NavigationInstructionService } from '../services/NavigationInstructionService';

interface AllStepsDrawerProps {
  visible: boolean;
  steps: NavigationStep[];
  currentStepIndex: number;
  onClose: () => void;
  onStepPress?: (stepIndex: number) => void;
  totalDistance: number;
  totalDuration: number;
  remainingDistance: number;
  remainingDuration: number;
  distanceToNextStep?: number; // Distance restante jusqu'à la prochaine étape
  currentStepDistance?: number; // Distance totale de l'étape actuelle
}

const { height: screenHeight } = Dimensions.get('window');
const DRAWER_HEIGHT = screenHeight * 0.75; // 75% de l'écran

export default function AllStepsDrawer({
  visible,
  steps,
  currentStepIndex,
  onClose,
  onStepPress,
  totalDistance,
  totalDuration,
  remainingDistance,
  remainingDuration,
  distanceToNextStep = 0,
  currentStepDistance = 0,
}: AllStepsDrawerProps) {
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;

  // Animation logic
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

  // Formater la distance
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    } else {
      return `${(meters / 1000).toFixed(1)}km`;
    }
  };

  // Formater le temps
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}min` : ''}`;
    }
  };

  // Obtenir l'icône Material pour chaque type de manœuvre
  const getManeuverIcon = (step: NavigationStep, stepIndex: number): string => {
    const instruction = NavigationInstructionService.generateInstructionFromStep(
      step,
      steps[stepIndex + 1],
      stepIndex === 0,
      true
    );
    
    switch (instruction.icon) {
      case 'straight': return 'straight';
      case 'turn-left': return 'turn-left';
      case 'turn-right': return 'turn-right';
      case 'turn-slight-left': return 'turn-slight-left';
      case 'turn-slight-right': return 'turn-slight-right';
      case 'turn-sharp-left': return 'turn-sharp-left';
      case 'turn-sharp-right': return 'turn-sharp-right';
      case 'u-turn-left': return 'u-turn-left';
      case 'roundabout-left': return 'roundabout-left';
      case 'roundabout-right': return 'roundabout-right';
      case 'merge': return 'merge-type';
      case 'fork-left': return 'call-split';
      case 'flag': return 'flag';
      default: return 'navigation';
    }
  };

  // Calculer la progression de l'utilisateur sur l'étape actuelle
  const getUserProgressOnCurrentStep = (): number => {
    if (currentStepDistance <= 0 || distanceToNextStep < 0) return 0;
    const progressDistance = currentStepDistance - distanceToNextStep;
    return Math.max(0, Math.min(1, progressDistance / currentStepDistance));
  };

  const renderStepItem = ({ item, index }: { item: NavigationStep, index: number }) => {
    const isCurrentStep = index === currentStepIndex;
    const isCompletedStep = index < currentStepIndex;
    const isFutureStep = index > currentStepIndex;
    const instruction = NavigationInstructionService.generateInstructionFromStep(
      item,
      steps[index + 1],
      index === 0,
      true
    );

    return (
      <TouchableOpacity
        style={[
          styles.stepItem,
          isCurrentStep && styles.currentStepItem,
          isCompletedStep && styles.completedStepItem,
          isFutureStep && styles.futureStepItem,
        ]}
        onPress={() => onStepPress && onStepPress(index)}
        activeOpacity={0.7}
      >
        <View style={styles.stepIconContainer}>
          <View style={[
            styles.stepIconCircle,
            isCurrentStep && styles.currentStepIconCircle,
            isCompletedStep && styles.completedStepIconCircle,
          ]}>
            {isCompletedStep ? (
              <Icon name={"check" as any} size={16} color="white" />
            ) : (
              <Icon 
                name={getManeuverIcon(item, index) as any} 
                size={16} 
                color={isCurrentStep ? 'white' : '#666'} 
              />
            )}
          </View>
          
          {/* Indicateur de position utilisateur sur l'étape actuelle */}
          {isCurrentStep && (
            <View 
              style={[
                styles.userPositionIndicator,
                { top: 24 + (getUserProgressOnCurrentStep() * 36) } // Position dynamique sur le connecteur
              ]}
            >
              <Icon name="keyboard-arrow-down" size={20} color="#FF6B35" />
            </View>
          )}
          
          {index < steps.length - 1 && (
            <View style={[
              styles.stepConnector,
              isCompletedStep && styles.completedStepConnector,
              isCurrentStep && styles.currentStepConnector,
            ]} />
          )}
        </View>

        <View style={styles.stepContent}>
          <Text style={[
            styles.stepInstruction,
            isCurrentStep && styles.currentStepInstruction,
            isCompletedStep && styles.completedStepInstruction,
          ]}>
            {instruction.text}
          </Text>
          
          {item.streetName && (
            <Text style={[
              styles.stepStreet,
              isCurrentStep && styles.currentStepStreet,
              isCompletedStep && styles.completedStepStreet,
            ]}>
              {item.streetName}
            </Text>
          )}
          
          <View style={styles.stepMeta}>
            <Text style={[
              styles.stepDistance,
              isCurrentStep && styles.currentStepDistance,
              isCompletedStep && styles.completedStepDistance,
            ]}>
              {formatDistance(item.distance)}
            </Text>
            <Text style={[
              styles.stepDuration,
              isCurrentStep && styles.currentStepDuration,
              isCompletedStep && styles.completedStepDuration,
            ]}>
              {formatTime(item.duration)}
            </Text>
          </View>
        </View>

        {isCurrentStep && (
          <View style={styles.currentStepBadge}>
            <Text style={styles.currentStepBadgeText}>Actuel</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

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
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Icon name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>Itinéraire complet</Text>
        <View style={styles.summaryStats}>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>{formatDistance(totalDistance)}</Text>
            <Text style={styles.summaryStatLabel}>Distance totale</Text>
          </View>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>{formatTime(totalDuration)}</Text>
            <Text style={styles.summaryStatLabel}>Temps total</Text>
          </View>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>{formatDistance(remainingDistance)}</Text>
            <Text style={styles.summaryStatLabel}>Restant</Text>
          </View>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>{formatTime(remainingDuration)}</Text>
            <Text style={styles.summaryStatLabel}>Temps restant</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={steps}
        renderItem={renderStepItem}
        keyExtractor={(item, index) => `step-${index}`}
        style={styles.stepsList}
        showsVerticalScrollIndicator={false}
        initialScrollIndex={Math.max(0, currentStepIndex - 1)}
        getItemLayout={(data, index) => ({
          length: 80,
          offset: 80 * index,
          index,
        })}
      />
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
  summaryContainer: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  summaryStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  stepsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#E0E0E0', // Étape non atteinte - gris clair
    paddingLeft: 16,
    marginLeft: 4,
  },
  currentStepItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF', // Étape actuelle - bleu
    paddingLeft: 16,
    marginLeft: 4,
  },
  completedStepItem: {
    opacity: 0.7,
    borderLeftColor: '#34C759', // Étape terminée - vert
  },
  futureStepItem: {
    borderLeftColor: '#E0E0E0', // Étape future - gris plus clair
    opacity: 0.8,
  },
  stepIconContainer: {
    alignItems: 'center',
    marginRight: 16,
    marginLeft: -4, // Compenser légèrement la bordure gauche
    width: 24,
    position: 'relative', // Nécessaire pour positionner l'indicateur utilisateur
  },
  stepIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  currentStepIconCircle: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  completedStepIconCircle: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  stepConnector: {
    width: 2,
    height: 40,
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  completedStepConnector: {
    backgroundColor: '#34C759',
  },
  stepContent: {
    flex: 1,
  },
  stepInstruction: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  currentStepInstruction: {
    color: '#007AFF',
    fontWeight: '600',
  },
  completedStepInstruction: {
    color: '#666',
  },
  stepStreet: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  currentStepStreet: {
    color: '#007AFF',
  },
  completedStepStreet: {
    color: '#999',
  },
  stepMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  stepDistance: {
    fontSize: 12,
    color: '#666',
  },
  currentStepDistance: {
    color: '#007AFF',
  },
  completedStepDistance: {
    color: '#999',
  },
  stepDuration: {
    fontSize: 12,
    color: '#666',
  },
  currentStepDuration: {
    color: '#007AFF',
  },
  completedStepDuration: {
    color: '#999',
  },
  currentStepBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  currentStepBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  
  // Styles pour les badges numériques des étapes
  stepNumberBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'white',
  },
  currentStepNumberBadge: {
    backgroundColor: '#007AFF',
  },
  completedStepNumberBadge: {
    backgroundColor: '#34C759',
  },
  stepNumberText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  currentStepNumberText: {
    color: 'white',
  },
  completedStepNumberText: {
    color: 'white',
  },
  
  // Style pour le connecteur de l'étape actuelle
  currentStepConnector: {
    backgroundColor: '#007AFF',
    width: 3, // Légèrement plus épais pour l'étape actuelle
  },

  // Style pour l'indicateur de position utilisateur
  userPositionIndicator: {
    position: 'absolute',
    left: -8, // Centré sur le connecteur
    backgroundColor: 'white',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 10,
  },
});

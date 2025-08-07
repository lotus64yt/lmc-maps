import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  SafeAreaView,
  Vibration,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import NavigationService from '../services/NavigationService';
import { NavigationState } from '../types/RouteTypes';
import { formatDistance, formatDurationFromSeconds } from '../utils/formatUtils';
import AllStepsDrawer from './AllStepsDrawer';

interface NavigationGuidanceProps {
  visible: boolean;
  onStop: () => void;
  onShowAllSteps?: () => void; // Callback to adjust map view when drawer opens
  onAddNavigationStep?: () => void; // Nouveau callback pour ajouter une étape
  isRecalculatingRoute?: boolean; // Nouvel état pour afficher le spinner de recalcul
}

export default function NavigationGuidance({ visible, onStop, onShowAllSteps, onAddNavigationStep, isRecalculatingRoute = false }: NavigationGuidanceProps) {
  const [navigationState, setNavigationState] = useState<NavigationState>(
    NavigationService.getCurrentState()
  );
  const [isStepsDrawerVisible, setIsStepsDrawerVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // État pour le menu
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // S'abonner aux changements d'état de navigation
    const handleStateChange = (state: NavigationState) => {
      setNavigationState(state);
    };

    NavigationService.addListener(handleStateChange);

    return () => {
      NavigationService.removeListener(handleStateChange);
    };
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible && navigationState.isNavigating ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, navigationState.isNavigating]);

  const handleStopNavigation = () => {
    Vibration.vibrate(100); // Vibration plus longue pour arrêter la navigation
    NavigationService.stopNavigation();
    onStop();
  };

  const handleOpenStepsDrawer = () => {
    setIsStepsDrawerVisible(true);
    onShowAllSteps?.(); // Notify parent to adjust map view
  };

  const handleCloseStepsDrawer = () => {
    setIsStepsDrawerVisible(false);
  };

  const handleMenuToggle = () => {
    setShowMenu(!showMenu);
  };

  const handleAddStep = () => {
    setShowMenu(false);
    onAddNavigationStep?.();
  };

  const handleStopFromMenu = () => {
    setShowMenu(false);
    handleStopNavigation();
  };

  if (!visible || !navigationState.isNavigating) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Barre de guidage en haut - Prochaine étape */}
      <SafeAreaView>
        <View style={styles.topGuidance}>
          <View style={styles.maneuverContainer}>
            <Icon
              name={NavigationService.getManeuverIcon(navigationState.nextStep?.maneuver || 'straight') as any}
              size={32}
              color="#007AFF"
            />
          </View>
          <View style={styles.instructionContainer}>
            <Text style={styles.instruction} numberOfLines={2}>
              {navigationState.nextStep?.instruction || 'Continuer tout droit'}
            </Text>
            <Text style={styles.streetName} numberOfLines={1}>
              {navigationState.nextStep?.streetName || ''}
            </Text>
          </View>
          <View style={styles.distanceContainer}>
            <Text style={styles.distanceToNext}>
              {formatDistance(navigationState.distanceToNextStep)}
            </Text>
            <Text style={styles.direction}>
              {navigationState.nextStep?.direction || ''}
            </Text>
          </View>
        </View>
        
        {/* Barre de recalcul */}
        {isRecalculatingRoute && (
          <View style={styles.recalculatingBar}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.recalculatingText}>Calcul en cours...</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Barre de statut en bas - Informations globales */}
      <View style={styles.bottomGuidance}>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Icon name="schedule" size={20} color="#666" />
            <Text style={styles.statLabel}>Temps restant</Text>
            <Text style={styles.statValue}>
              {formatDurationFromSeconds(navigationState.remainingDuration)}
            </Text>
          </View>
          
          <View style={styles.separator} />
          
          <View style={styles.statItem}>
            <Icon name="straighten" size={20} color="#666" />
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValue}>
              {formatDistance(navigationState.remainingDistance)}
            </Text>
          </View>
          
          <View style={styles.separator} />
          
          <TouchableOpacity style={styles.statItem} onPress={handleOpenStepsDrawer}>
            <Icon name="list" size={20} color="#007AFF" />
            <Text style={styles.statLabel}>Étapes</Text>
            <Text style={styles.stepCounter}>
              {navigationState.currentStepIndex + 1}/{navigationState.steps.length}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.menuButton}
          onPress={handleMenuToggle}
        >
          <Icon name="more-vert" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Menu contextuel */}
      <Modal
        visible={showMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity 
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={handleAddStep}
            >
              <Icon name="add-location" size={20} color="#333" />
              <Text style={styles.menuItemText}>Ajouter une étape</Text>
            </TouchableOpacity>
            
            <View style={styles.menuSeparator} />
            
            <TouchableOpacity 
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={handleStopFromMenu}
            >
              <Icon name="stop" size={20} color="#FF3B30" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Arrêter la navigation</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* AllStepsDrawer */}
      <AllStepsDrawer
        visible={isStepsDrawerVisible}
        onClose={handleCloseStepsDrawer}
        steps={navigationState.steps}
        currentStepIndex={navigationState.currentStepIndex}
        totalDistance={navigationState.steps.reduce((total, step) => total + step.distance, 0)}
        totalDuration={navigationState.steps.reduce((total, step) => total + step.duration, 0)}
        remainingDistance={navigationState.remainingDistance}
        remainingDuration={navigationState.remainingDuration}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  
  // Barre de guidage en haut
  topGuidance: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  maneuverContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#F0F8FF',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  instructionContainer: {
    flex: 1,
    marginRight: 12,
  },
  instruction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  streetName: {
    fontSize: 14,
    color: '#666',
  },
  distanceContainer: {
    alignItems: 'flex-end',
  },
  distanceToNext: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  direction: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },

  // Barre de statut en bas
  bottomGuidance: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 34, // Pour l'encoche iPhone
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  statsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  stepCounter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 2,
  },
  separator: {
    width: 1,
    height: 30,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  stopButton: {
    width: 48,
    height: 48,
    backgroundColor: '#FF3B30',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  menuButton: {
    width: 48,
    height: 48,
    backgroundColor: '#666',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingBottom: 100, // Espacement au-dessus de la barre de navigation
  },
  menuContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuItemDanger: {
    // Pas de style spécial, juste pour la différenciation
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 12,
  },
  menuItemTextDanger: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  menuSeparator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 16,
  },

  // Styles pour la barre de recalcul
  recalculatingBar: {
    backgroundColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  recalculatingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
    marginLeft: 8,
  },
});

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
  Vibration
} from "react-native";
import Icon from 'react-native-vector-icons/MaterialIcons';
import { formatDuration, formatDistance } from '../utils/formatUtils';

interface Destination {
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}

interface TransportMode {
  id: string;
  name: string;
  icon: string;
  duration: string;
  distance: string;
  color: string;
}

interface RouteDrawerProps {
  visible: boolean;
  destination: Destination | null;
  onClose: () => void;
  onStartNavigation: (transportMode: string) => void;
  onTransportModeChange?: (mode: string, destination: Destination) => void;
  userLocation: { latitude: number; longitude: number } | null;
}

const { height: screenHeight } = Dimensions.get('window');
const DRAWER_HEIGHT = screenHeight * 0.45; // Réduit de 0.6 à 0.45
const PEEK_HEIGHT = 120;
const SEARCH_BAR_HEIGHT = 100; // Hauteur approximative de la barre de recherche + marges

export default function RouteDrawer({
  visible,
  destination,
  onClose,
  onStartNavigation,
  onTransportModeChange,
  userLocation
}: RouteDrawerProps) {
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const [selectedTransport, setSelectedTransport] = React.useState('driving');

  // Fonction pour changer le mode de transport et déclencher l'affichage du trajet
  const handleTransportModeChange = (modeId: string) => {
    Vibration.vibrate(50); // Vibration pour feedback de sélection
    setSelectedTransport(modeId);
    
    // Déclencher l'affichage du trajet sur la carte
    if (onTransportModeChange && destination) {
      onTransportModeChange(modeId, destination);
    }
  };

  // Fonction pour fermer avec vibration
  const handleCloseWithVibration = () => {
    Vibration.vibrate(50);
    onClose();
  };

  // Fonction pour démarrer navigation avec vibration
  const handleStartNavigationWithVibration = () => {
    Vibration.vibrate(100); // Vibration plus forte pour action importante
    onStartNavigation(selectedTransport);
  };

  // Modes de transport avec estimations
  const transportModes: TransportMode[] = [
    {
      id: 'driving',
      name: 'Voiture',
      icon: 'directions-car',
      duration: calculateDuration('driving'),
      distance: calculateDistance(),
      color: '#4285F4'
    },
    {
      id: 'walking',
      name: 'À pied',
      icon: 'directions-walk',
      duration: calculateDuration('walking'),
      distance: calculateDistance(),
      color: '#34A853'
    },
    {
      id: 'bicycling',
      name: 'Vélo',
      icon: 'directions-bike',
      duration: calculateDuration('bicycling'),
      distance: calculateDistance(),
      color: '#FBBC04'
    },
    {
      id: 'transit',
      name: 'Transport',
      icon: 'directions-transit',
      duration: calculateDuration('transit'),
      distance: calculateDistance(),
      color: '#EA4335'
    }
  ];

  // Calcul approximatif de la distance
  function calculateDistance(): string {
    if (!destination || !userLocation) return "-- km";
    
    const R = 6371; // Rayon de la Terre en km
    const dLat = (destination.latitude - userLocation.latitude) * Math.PI / 180;
    const dLon = (destination.longitude - userLocation.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(userLocation.latitude * Math.PI / 180) * Math.cos(destination.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distanceKm = R * c;
    
    return formatDistance(distanceKm * 1000); // Convertir en mètres pour formatDistance
  }

  // Calcul approximatif de la durée selon le mode
  function calculateDuration(mode: string): string {
    if (!destination || !userLocation) return "-- min";
    
    const distance = parseFloat(calculateDistance().replace('km', '').replace('m', ''));
    let speed: number;
    
    switch (mode) {
      case 'driving':
        speed = 50; // km/h moyenne en ville
        break;
      case 'walking':
        speed = 5; // km/h
        break;
      case 'bicycling':
        speed = 15; // km/h
        break;
      case 'transit':
        speed = 25; // km/h moyenne transports
        break;
      default:
        speed = 50;
    }
    
    const timeHours = distance / speed;
    const timeMinutes = timeHours * 60;
    
    return formatDuration(timeMinutes);
  }

  // Gestion du pan pour glisser le drawer
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dy) > 5;
    },
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      const visibleMapHeight = screenHeight - SEARCH_BAR_HEIGHT - DRAWER_HEIGHT;
      const targetPosition = Math.max(0, visibleMapHeight * 0.1);
      
      if (gestureState.dy > 100) {
        closeDrawer();
      } else {
        // Retourner à la position optimale pour voir le trajet
        Animated.spring(translateY, {
          toValue: targetPosition,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
      }
    },
  });

  const openDrawer = () => {
    // Calculer la position pour laisser visible la zone entre search bar et drawer
    const visibleMapHeight = screenHeight - SEARCH_BAR_HEIGHT - DRAWER_HEIGHT;
    const targetPosition = Math.max(0, visibleMapHeight * 0.1); // 10% de marge
    
    Animated.spring(translateY, {
      toValue: targetPosition,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(translateY, {
      toValue: DRAWER_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  useEffect(() => {
    if (visible) {
      openDrawer();
      // Afficher le trajet par défaut (voiture) quand le drawer s'ouvre
      if (onTransportModeChange && destination) {
        onTransportModeChange('driving', destination);
      }
    } else {
      closeDrawer();
    }
  }, [visible]);

  if (!visible || !destination) return null;

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
      {/* Handle pour glisser */}
      <View style={styles.handle} />
      
      {/* Contenu du drawer */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Informations destination */}
        <View style={styles.destinationInfo}>
          <Icon name="place" size={24} color="#EA4335" />
          <View style={styles.destinationText}>
            <Text style={styles.destinationTitle} numberOfLines={1}>
              {destination.title}
            </Text>
            <Text style={styles.destinationSubtitle} numberOfLines={2}>
              {destination.subtitle}
            </Text>
          </View>
          {/* Bouton de fermeture */}
          <TouchableOpacity style={styles.closeButton} onPress={handleCloseWithVibration}>
            <Icon name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Modes de transport */}
        <View style={styles.transportSection}>
          <Text style={styles.sectionTitle}>Modes de transport</Text>
          <View style={styles.transportModes}>
            {transportModes.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[
                  styles.transportMode,
                  selectedTransport === mode.id && styles.transportModeSelected
                ]}
                onPress={() => handleTransportModeChange(mode.id)}
              >
                <Icon 
                  name={mode.icon} 
                  size={24} 
                  color={selectedTransport === mode.id ? '#fff' : mode.color} 
                />
                <Text style={[
                  styles.transportName,
                  selectedTransport === mode.id && styles.transportNameSelected
                ]}>
                  {mode.name}
                </Text>
                <Text style={[
                  styles.transportDuration,
                  selectedTransport === mode.id && styles.transportDurationSelected
                ]}>
                  {mode.duration}
                </Text>
                <Text style={[
                  styles.transportDistance,
                  selectedTransport === mode.id && styles.transportDistanceSelected
                ]}>
                  {mode.distance}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Détails du trajet sélectionné */}
        <View style={styles.routeDetails}>
          <Text style={styles.sectionTitle}>Détails du trajet</Text>
          <View style={styles.routeInfo}>
            {transportModes.find(m => m.id === selectedTransport) && (
              <View style={styles.routeStats}>
                <View style={styles.statItem}>
                  <Icon name="schedule" size={20} color="#666" />
                  <Text style={styles.statText}>
                    {transportModes.find(m => m.id === selectedTransport)?.duration}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Icon name="straighten" size={20} color="#666" />
                  <Text style={styles.statText}>
                    {transportModes.find(m => m.id === selectedTransport)?.distance}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Boutons d'action */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCloseWithVibration}
          >
            <Text style={styles.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.startButton}
            onPress={handleStartNavigationWithVibration}
          >
            <Icon name="navigation" size={20} color="#fff" />
            <Text style={styles.startButtonText}>Démarrer</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  destinationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  destinationText: {
    flex: 1,
    marginLeft: 12,
  },
  destinationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  destinationSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  transportSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  transportModes: {
    gap: 8,
  },
  transportMode: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  transportModeSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  transportName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  transportNameSelected: {
    color: '#fff',
  },
  transportDuration: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  transportDurationSelected: {
    color: '#fff',
  },
  transportDistance: {
    fontSize: 12,
    color: '#999',
    minWidth: 50,
    textAlign: 'right',
  },
  transportDistanceSelected: {
    color: '#fff',
  },
  routeDetails: {
    marginBottom: 24,
  },
  routeInfo: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 32,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  startButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
    marginLeft: 'auto',
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
});

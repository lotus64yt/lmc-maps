import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { OverpassPOI, OverpassService } from '@/services/OverpassService';
import { formatDistance, formatDuration } from '@/utils/formatUtils';

interface POIDrawerProps {
  visible: boolean;
  amenityType: string;
  userLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onSelectPOI: (poi: OverpassPOI) => void;
  onShowRoute: (poi: OverpassPOI, transportMode: string) => void;
  onRadiusChange: (radius: number) => void;
  onPOIsFound?: (pois: OverpassPOI[]) => void;
  initialRadius?: number;
  preloadedPois?: OverpassPOI[]; // POI déjà récupérés depuis l'ExpandableSearch
  isNavigating?: boolean; // Nouveau prop pour savoir si on est en navigation
  onAddNavigationStop?: (poi: OverpassPOI) => void; // Nouveau prop pour ajouter un arrêt
  onCameraMove?: (coordinate: { latitude: number; longitude: number } | null) => void; // Nouveau prop pour gérer la caméra
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_MIN_HEIGHT = 400;
const DRAWER_MAX_HEIGHT = SCREEN_HEIGHT * 10;

// Composant ScrollView avec support de ref
const CustomScrollView = ScrollView as any;

export default function POIDrawer({
  visible,
  amenityType,
  userLocation,
  onClose,
  onSelectPOI,
  onShowRoute,
  onRadiusChange,
  onPOIsFound,
  initialRadius = 1000,
  preloadedPois,
  isNavigating = false,
  onAddNavigationStop,
  onCameraMove,
}: POIDrawerProps) {
  const [pois, setPois] = useState<OverpassPOI[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<OverpassPOI | null>(null);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(initialRadius);
  const [tempRadius, setTempRadius] = useState(initialRadius);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTransportMode, setActiveTransportMode] = useState('walking');

  const translateY = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const poiScrollRef = useRef<ScrollView>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const transportModes = [
    { id: 'walking', icon: 'directions-walk', label: 'Marche' },
    { id: 'bicycling', icon: 'directions-bike', label: 'Vélo' },
    { id: 'driving', icon: 'directions-car', label: 'Voiture' },
    { id: 'transit', icon: 'directions-transit', label: 'Transport' },
  ];

  // Grouper les POI par type d'amenity pour la recherche générale (filtrés par rayon)
  const groupedPOIs = React.useMemo(() => {
    // Filtrer les POI par rayon d'abord
    const filteredPois = pois.filter(poi => (poi.distance || 0) <= radius);
    
    if (amenityType !== '*') return { [amenityType]: filteredPois };
    
    const groups: Record<string, OverpassPOI[]> = {};
    filteredPois.forEach(poi => {
      const amenity = poi.tags.amenity || 'other';
      if (!groups[amenity]) {
        groups[amenity] = [];
      }
      groups[amenity].push(poi);
    });
    
    // Trier les groupes par nombre de POI (décroissant)
    const sortedGroups: Record<string, OverpassPOI[]> = {};
    Object.keys(groups)
      .sort((a, b) => groups[b].length - groups[a].length)
      .forEach(key => {
        sortedGroups[key] = groups[key].sort((a, b) => (a.distance || 0) - (b.distance || 0));
      });
    
    return sortedGroups;
  }, [pois, amenityType, radius]);

  // Liste plate des POI pour l'affichage horizontal
  const flatPOIs = React.useMemo(() => {
    return Object.values(groupedPOIs).flat();
  }, [groupedPOIs]);

  // Rechercher les POI (une seule fois avec un rayon large)
  const searchPOIs = async () => {
    if (!userLocation) return;
    console.log("fetch overpass api")

    setLoading(true);
    try {
      // Rechercher avec un rayon fixe de 5km pour avoir plus de données à filtrer
      const results = await OverpassService.searchPOI(
        userLocation.latitude,
        userLocation.longitude,
        5000, // Rayon fixe de 5km
        amenityType
      );
      setPois(results);
      
      // Notifier le parent des POI trouvés (filtrés par le rayon actuel)
      if (onPOIsFound) {
        const filteredResults = results.filter(poi => (poi.distance || 0) <= radius);
        onPOIsFound(filteredResults);
      }
      
      // Sélectionner le premier POI dans le rayon actuel
      const filteredResults = results.filter(poi => (poi.distance || 0) <= radius);
      if (filteredResults.length > 0) {
        setSelectedPOI(filteredResults[0]);
        onSelectPOI(filteredResults[0]);
        // Déplacer la caméra vers le premier POI
        if (onCameraMove) {
          onCameraMove({ latitude: filteredResults[0].lat, longitude: filteredResults[0].lon });
        }
        // Afficher le bouton
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      } else {
        // Aucun POI dans le rayon, déplacer la caméra vers l'utilisateur
        if (onCameraMove && userLocation) {
          onCameraMove(userLocation);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la recherche POI:', error);
    } finally {
      setLoading(false);
    }
  };

  // Effet pour rechercher quand le drawer devient visible ou que l'amenityType change
  React.useEffect(() => {
    if (visible && userLocation) {
      // Si on a des POI pré-chargés, les utiliser au lieu de faire une nouvelle recherche
      if (preloadedPois && preloadedPois.length > 0) {setPois(preloadedPois);
        
        // Notifier le parent des POI trouvés (filtrés par le rayon actuel)
        if (onPOIsFound) {
          const filteredResults = preloadedPois.filter(poi => (poi.distance || 0) <= radius);
          onPOIsFound(filteredResults);
        }
        
        // Sélectionner le premier POI dans le rayon actuel
        const filteredResults = preloadedPois.filter(poi => (poi.distance || 0) <= radius);
        if (filteredResults.length > 0) {
          setSelectedPOI(filteredResults[0]);
          onSelectPOI(filteredResults[0]);
          // Déplacer la caméra vers le premier POI
          if (onCameraMove) {
            onCameraMove({ latitude: filteredResults[0].lat, longitude: filteredResults[0].lon });
          }
          // Afficher le bouton
          Animated.timing(buttonOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        } else {
          // Aucun POI dans le rayon, déplacer la caméra vers l'utilisateur
          if (onCameraMove && userLocation) {
            onCameraMove(userLocation);
          }
        }
      } else {
        // Sinon, faire la recherche API
        searchPOIs();
      }
    }
  }, [visible, userLocation, amenityType, preloadedPois]);

  // Nettoyer le timeout quand le composant se démonte
  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Mettre à jour tempRadius quand initialRadius change
  React.useEffect(() => {
    setRadius(initialRadius);
    setTempRadius(initialRadius);
  }, [initialRadius]);

  // Effet pour gérer la caméra quand le drawer s'ouvre
  React.useEffect(() => {
    if (visible && !selectedPOI && onCameraMove && userLocation) {
      // Si aucun POI sélectionné quand le drawer s'ouvre, centrer sur l'utilisateur
      onCameraMove(userLocation);
    }
  }, [visible]);

  // Effet pour animer le bouton quand selectedPOI change
  React.useEffect(() => {
    Animated.timing(buttonOpacity, {
      toValue: selectedPOI ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [selectedPOI]);

  // Gestion du slider pour le rayon (filtrage local seulement)
  const handleRadiusChange = (newRadius: number) => {
    const roundedRadius = Math.round(newRadius);
    setTempRadius(roundedRadius);
    setRadius(roundedRadius);
    onRadiusChange(roundedRadius);
    
    // Notifier le parent avec les POI filtrés par le nouveau rayon
    if (onPOIsFound && pois.length > 0) {
      const filteredResults = pois.filter(poi => (poi.distance || 0) <= roundedRadius);
      onPOIsFound(filteredResults);
    }
    
    // Annuler le timeout précédent si il existe
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  // Sélection/déselection d'un POI
  const handlePOISelect = (poi: OverpassPOI, index: number) => {
    // Si on clique sur le POI déjà sélectionné, le déselectionner
    if (selectedPOI?.id === poi.id) {
      setSelectedPOI(null);
      // Déplacer la caméra vers l'utilisateur quand aucun POI sélectionné
      if (onCameraMove && userLocation) {
        onCameraMove(userLocation);
      }
      // Animer le bouton pour le faire disparaître
      Animated.timing(buttonOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      // Sélectionner le nouveau POI
      setSelectedPOI(poi);
      onSelectPOI(poi);
      
      // Déplacer la caméra vers le POI sélectionné
      if (onCameraMove) {
        onCameraMove({ latitude: poi.lat, longitude: poi.lon });
      }
      
      // Animer le bouton pour l'afficher
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      // Scroll horizontal vers le POI sélectionné
      poiScrollRef.current?.scrollTo({
        x: index * 280,
        animated: true,
      });
    }
  };

  // Gestion de l'expansion du drawer
  const toggleExpansion = () => {
    const toValue = isExpanded ? DRAWER_MIN_HEIGHT : DRAWER_MAX_HEIGHT;
    setIsExpanded(!isExpanded);
    
    Animated.spring(translateY, {
      toValue,
      useNativeDriver: true,
    }).start();
  };

  // Afficher l'itinéraire
  const handleShowRoute = () => {
    if (selectedPOI) {
      onShowRoute(selectedPOI, activeTransportMode);
    }
  };

  // Ajouter un arrêt pendant la navigation
  const handleAddNavigationStop = () => {
    if (selectedPOI && onAddNavigationStop) {
      onAddNavigationStop(selectedPOI);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Header avec slider pour le rayon */}
          <View style={styles.header}>
            <TouchableOpacity onPress={toggleExpansion} style={styles.dragHandle}>
              <View style={styles.handle} />
            </TouchableOpacity>
            
            <View style={styles.titleRow}>
              <Text style={styles.title}>
                {amenityType === '*' 
                  ? `Tous les POI (${pois.length})`
                  : `${amenityType.charAt(0).toUpperCase() + amenityType.slice(1)} (${pois.length})`
                }
              </Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.radiusContainer}>
              <Text style={styles.radiusLabel}>
                Rayon de recherche: {Math.round(tempRadius)}m
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={500}
                maximumValue={5000}
                value={tempRadius}
                onValueChange={handleRadiusChange}
                minimumTrackTintColor="#007AFF"
                maximumTrackTintColor="#E0E0E0"
                step={250}
              />
            </View>
          </View>

          {/* Liste horizontale des POI */}
          <View style={styles.poisContainer}>
            {loading ? (
              <Text style={styles.loadingText}>Recherche en cours...</Text>
            ) : (
              <CustomScrollView
                ref={poiScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.poisScrollContent}
              >
                {flatPOIs.map((poi, index) => (
                  <TouchableOpacity
                    key={poi.id}
                    style={[
                      styles.poiCard,
                      selectedPOI?.id === poi.id && styles.selectedPoiCard,
                    ]}
                    onPress={() => handlePOISelect(poi, index)}
                  >
                    <Text style={styles.poiName}>
                      {OverpassService.formatPOIName(poi)}
                    </Text>
                    <Text style={styles.poiAddress}>
                      {OverpassService.formatPOIAddress(poi) || 'Adresse non disponible'}
                    </Text>
                    <Text style={styles.poiDistance}>
                      {formatDistance(poi.distance || 0)}
                    </Text>
                    
                    {amenityType === '*' && (
                      <Text style={styles.poiType}>
                        {poi.tags.amenity}
                      </Text>
                    )}
                    
                    {poi.tags.opening_hours && (
                      <Text style={styles.poiHours}>
                        {poi.tags.opening_hours}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </CustomScrollView>
            )}
          </View>

          {/* Résumé des types de POI pour la recherche générale */}
          {amenityType === '*' && Object.keys(groupedPOIs).length > 1 && (
            <View style={styles.poiSummary}>
              <Text style={styles.summaryTitle}>Types trouvés :</Text>
              <CustomScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.summaryScrollContent}
              >
                {Object.entries(groupedPOIs).map(([type, poisOfType]) => (
                  <View key={type} style={styles.summaryItem}>
                    <Text style={styles.summaryType}>{type}</Text>
                    <Text style={styles.summaryCount}>{poisOfType.length}</Text>
                  </View>
                ))}
              </CustomScrollView>
            </View>
          )}

          {/* Section détails et itinéraire (visible quand étendu) */}
          {isExpanded && selectedPOI && (
            <View style={styles.routeSection}>
              <Text style={styles.sectionTitle}>Informations détaillées</Text>
              
              <View style={styles.poiDetails}>
                <Text style={styles.detailTitle}>
                  {OverpassService.formatPOIName(selectedPOI)}
                </Text>
                
                {selectedPOI.tags.cuisine && (
                  <Text style={styles.detailText}>
                    Cuisine: {selectedPOI.tags.cuisine}
                  </Text>
                )}
                
                {selectedPOI.tags.phone && (
                  <Text style={styles.detailText}>
                    Téléphone: {selectedPOI.tags.phone}
                  </Text>
                )}
                
                {selectedPOI.tags.website && (
                  <Text style={styles.detailText}>
                    Site web: {selectedPOI.tags.website}
                  </Text>
                )}
              </View>

              <Text style={styles.sectionTitle}>Comment s'y rendre</Text>
              
              {/* Modes de transport */}
              <CustomScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.transportModes}
              >
                {transportModes.map((mode) => (
                  <TouchableOpacity
                    key={mode.id}
                    style={[
                      styles.transportMode,
                      activeTransportMode === mode.id && styles.activeTransportMode,
                    ]}
                    onPress={() => setActiveTransportMode(mode.id)}
                  >
                    <MaterialIcons
                      name={mode.icon as any}
                      size={24}
                      color={activeTransportMode === mode.id ? '#FFF' : '#007AFF'}
                    />
                    <Text
                      style={[
                        styles.transportLabel,
                        activeTransportMode === mode.id && styles.activeTransportLabel,
                      ]}
                    >
                      {mode.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </CustomScrollView>

              {/* Boutons d'action */}
              <View style={styles.actionButtons}>
                {/* Bouton pour afficher l'itinéraire (mode normal) */}
                {!isNavigating && (
                  <TouchableOpacity
                    style={styles.routeButton}
                    onPress={handleShowRoute}
                  >
                    <MaterialIcons name="directions" size={20} color="#FFF" />
                    <Text style={styles.routeButtonText}>
                      Afficher l'itinéraire
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Bouton pour ajouter un arrêt (mode navigation) */}
                {isNavigating && onAddNavigationStop && (
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={handleAddNavigationStop}
                  >
                    <MaterialIcons name="add-location" size={20} color="#FFF" />
                    <Text style={styles.stopButtonText}>
                      Ajouter un arrêt
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          
          {/* Bouton flottant conditionnel */}
          <Animated.View
            style={[
              styles.floatingButton,
              {
                opacity: buttonOpacity,
                transform: [
                  {
                    translateY: buttonOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.actionButton,
                isNavigating ? styles.addStopButton : styles.navigateButton,
              ]}
              onPress={isNavigating ? handleAddNavigationStop : handleShowRoute}
              disabled={!selectedPOI}
            >
              <MaterialIcons
                name={isNavigating ? "add-location" : "directions"}
                size={20}
                color="#FFF"
              />
              <Text style={[
                styles.actionButtonText,
                isNavigating ? styles.addStopButtonText : styles.navigateButtonText,
              ]}>
                {isNavigating ? "Ajouter au trajet" : "Naviguer à ce point"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  drawer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: DRAWER_MIN_HEIGHT,
    maxHeight: DRAWER_MAX_HEIGHT,
    paddingBottom: 20,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  radiusContainer: {
    marginTop: 8,
  },
  radiusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 20,
  },
  poisContainer: {
    height: 120,
    paddingVertical: 12,
  },
  poisScrollContent: {
    paddingHorizontal: 16,
  },
  poiCard: {
    width: 260,
    marginRight: 12,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  selectedPoiCard: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  poiName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  poiAddress: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  poiDistance: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  poiHours: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  loadingText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
  },
  routeSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  poiDetails: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  transportModes: {
    marginBottom: 16,
  },
  transportMode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  activeTransportMode: {
    backgroundColor: '#007AFF',
  },
  transportLabel: {
    marginLeft: 4,
    fontSize: 14,
    color: '#007AFF',
  },
  activeTransportLabel: {
    color: '#FFF',
  },
  routeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
  },
  routeButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  poiType: {
    fontSize: 11,
    color: '#9C27B0',
    fontWeight: '500',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  poiSummary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  summaryScrollContent: {
    paddingRight: 16,
  },
  summaryItem: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    minWidth: 60,
  },
  summaryType: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    textTransform: 'capitalize',
  },
  summaryCount: {
    fontSize: 11,
    color: '#666',
  },
  actionButtons: {
    marginTop: 12,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    paddingVertical: 12,
    borderRadius: 8,
  },
  stopButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  
  // Nouveaux styles pour le bouton flottant
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  addStopButton: {
    backgroundColor: '#FF9500',
  },
  navigateButton: {
    backgroundColor: '#007AFF',
  },
  actionButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  addStopButtonText: {
    // Hérite de actionButtonText
  },
  navigateButtonText: {
    // Hérite de actionButtonText
  },
});

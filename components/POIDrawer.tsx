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
import { debugLog } from '@/utils/debugUtils';

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
  onCameraMove?: (coordinate: { latitude: number; longitude: number } | null, offset?: { x: number; y: number }) => void; // Nouveau prop pour gérer la caméra
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
  const spinValue = useRef(new Animated.Value(0)).current;
  const poiScrollRef = useRef<ScrollView>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const hasSearchedRef = useRef(false);
  const lastAmenityTypeRef = useRef<string>('');
  const notifiedPOIsRef = useRef<OverpassPOI[]>([]);
  const userManualSelectionRef = useRef(false); // Flag pour savoir si l'utilisateur a fait une sélection manuelle

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

  // Helper pour calculer l'offset de la caméra basé sur la hauteur du drawer
  const getCameraOffset = React.useCallback(() => {
    const drawerHeightPercent = isExpanded ? 0.7 : 0.4;
    const offsetY = SCREEN_HEIGHT * drawerHeightPercent * 0.3; // 30% de la hauteur du drawer
    return { x: 0, y: offsetY };
  }, [isExpanded]);

  // Liste plate des POI pour l'affichage horizontal
  const flatPOIs = React.useMemo(() => {
    return Object.values(groupedPOIs).flat();
  }, [groupedPOIs]);

  // Rechercher les POI (une seule fois avec un rayon large)
  const searchPOIs = React.useCallback(async () => {
    if (!userLocation || hasSearchedRef.current) return;
    debugLog.poi("Fetching from Overpass API");

    hasSearchedRef.current = true;
    lastAmenityTypeRef.current = amenityType;
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
      lastUserLocationRef.current = userLocation;
      
      // Sélectionner automatiquement le premier POI trouvé
      const filteredResults = results.filter(poi => (poi.distance || 0) <= radius);
      if (filteredResults.length > 0) {
        debugLog.poi(`Auto-selecting first POI from search: ${filteredResults[0].tags.name}`);
        setSelectedPOI(filteredResults[0]);
        onSelectPOI(filteredResults[0]);
        if (onCameraMove) {
          onCameraMove(
            { latitude: filteredResults[0].lat, longitude: filteredResults[0].lon },
            getCameraOffset()
          );
        }
      }
      
      // Notifier le parent
      if (onPOIsFound) {
        onPOIsFound(filteredResults);
        notifiedPOIsRef.current = filteredResults;
      }
      
    } catch (error) {
      console.error('Erreur lors de la recherche POI:', error);
      hasSearchedRef.current = false; // Permettre de réessayer en cas d'erreur
    } finally {
      setLoading(false);
    }
  }, [userLocation, amenityType, radius, onSelectPOI, onCameraMove, onPOIsFound, getCameraOffset]);

  // Effet optimisé pour gérer les changements de rayon uniquement
  React.useEffect(() => {
    debugLog.poi("Radius change effect triggered");
    if (pois.length > 0) {
      const filteredResults = pois.filter(poi => (poi.distance || 0) <= radius);
      
      // Notifier le parent seulement si les résultats ont changé
      if (onPOIsFound && JSON.stringify(filteredResults) !== JSON.stringify(notifiedPOIsRef.current)) {
        onPOIsFound(filteredResults);
        notifiedPOIsRef.current = filteredResults;
      }
      
      // Si le POI sélectionné n'est plus dans le rayon, sélectionner le premier disponible
      if (selectedPOI && filteredResults.length > 0) {
        const isSelectedInRange = filteredResults.some(poi => poi.id === selectedPOI.id);
        if (!isSelectedInRange && !userManualSelectionRef.current) {
          // Seulement remplacer si ce n'était pas une sélection manuelle
          debugLog.poi(`Replacing out-of-range POI: ${selectedPOI.tags.name} -> ${filteredResults[0].tags.name}`);
          setSelectedPOI(filteredResults[0]);
          onSelectPOI(filteredResults[0]);
          if (onCameraMove) {
            onCameraMove(
              { latitude: filteredResults[0].lat, longitude: filteredResults[0].lon },
              getCameraOffset()
            );
          }
        } else if (!isSelectedInRange && userManualSelectionRef.current) {
          // Si c'était une sélection manuelle et qu'elle n'est plus dans le rayon, garder la sélection
          console.log(`📍 useEffect radius - Manual selection out of range, keeping selection:`, selectedPOI.tags.name);
        }
      } else if (!selectedPOI && filteredResults.length > 0 && !userManualSelectionRef.current) {
        // Aucun POI sélectionné mais il y en a dans le rayon (seulement si pas de sélection manuelle)
        console.log(`📍 useEffect radius - Auto-selecting first POI:`, filteredResults[0].tags.name);
        setSelectedPOI(filteredResults[0]);
        onSelectPOI(filteredResults[0]);
        if (onCameraMove) {
          onCameraMove(
            { latitude: filteredResults[0].lat, longitude: filteredResults[0].lon },
            getCameraOffset()
          );
        }
      } else if (filteredResults.length === 0) {
        // Aucun POI dans le rayon
        console.log(`📍 useEffect radius - No POI in range, moving to user location`);
        setSelectedPOI(null);
        userManualSelectionRef.current = false; // Reset car aucun POI disponible
        if (onCameraMove && lastUserLocationRef.current) {
          onCameraMove(lastUserLocationRef.current);
        }
      }
    }
  }, [radius]); // Seulement dépendre du rayon

  // Effet pour initialiser le drawer quand il devient visible
  React.useEffect(() => {
    console.log("Second useEffect - drawer initialization")
    if (visible) {
      // Le drawer s'ouvre immédiatement, on gère le contenu après
      if (amenityType !== lastAmenityTypeRef.current) {
        // Nouveau type d'amenity, réinitialiser
        hasSearchedRef.current = false;
        lastAmenityTypeRef.current = amenityType;
        setSelectedPOI(null);
        setPois([]);
        notifiedPOIsRef.current = [];
      }
      
      // Si on a des POI pré-chargés, les utiliser
      if (preloadedPois && preloadedPois.length > 0 && !hasSearchedRef.current) {
        setPois(preloadedPois);
        hasSearchedRef.current = true;
        lastAmenityTypeRef.current = amenityType;
        
        // Sélectionner le premier POI
        const filteredResults = preloadedPois.filter(poi => (poi.distance || 0) <= radius);
        if (filteredResults.length > 0) {
          console.log(`📍 useEffect preloaded - Auto-selecting first POI from preloaded:`, filteredResults[0].tags.name);
          setSelectedPOI(filteredResults[0]);
          onSelectPOI(filteredResults[0]);
          if (onCameraMove) {
            onCameraMove(
              { latitude: filteredResults[0].lat, longitude: filteredResults[0].lon },
              getCameraOffset()
            );
          }
        }
        
        if (onPOIsFound) {
          onPOIsFound(filteredResults);
          notifiedPOIsRef.current = filteredResults;
        }
      }
    } else {
      // Drawer fermé, nettoyer
      hasSearchedRef.current = false;
      lastAmenityTypeRef.current = '';
      userManualSelectionRef.current = false; // Reset manual selection flag
      setSelectedPOI(null);
      setPois([]);
      notifiedPOIsRef.current = [];
    }
  }, [visible, amenityType]); // Seulement visible et amenityType

  // Effet pour déclencher la recherche quand userLocation devient disponible
  React.useEffect(() => {
    console.log("Search trigger useEffect")
    if (visible && userLocation && !hasSearchedRef.current && (!preloadedPois || preloadedPois.length === 0)) {
      searchPOIs();
    }
  }, [userLocation, visible, preloadedPois, searchPOIs]);

  // Nettoyer le timeout quand le composant se démonte
  React.useEffect(() => {
    console.log("Third useEffect")
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Mettre à jour tempRadius quand initialRadius change
  React.useEffect(() => {
    console.log("Fourth useEffect")
    setRadius(initialRadius);
    setTempRadius(initialRadius);
  }, [initialRadius]);

  // Effet pour gérer la caméra quand le drawer s'ouvre (une seule fois)
  React.useEffect(() => {
    console.log("Fifth useEffect")
    if (visible && !selectedPOI && onCameraMove && lastUserLocationRef.current) {
      // Si aucun POI sélectionné quand le drawer s'ouvre, centrer sur l'utilisateur
      onCameraMove(lastUserLocationRef.current);
    }
  }, [visible]); // Retirer les autres dépendances pour éviter les re-renders

  // Effet pour réajuster la caméra quand le drawer change d'état d'expansion
  React.useEffect(() => {
    console.log("Camera adjustment useEffect")
    if (visible && selectedPOI && onCameraMove) {
      // Réajuster la position de la caméra quand le drawer change de taille
      setTimeout(() => {
        onCameraMove(
          { latitude: selectedPOI.lat, longitude: selectedPOI.lon },
          getCameraOffset()
        );
      }, 300); // Délai pour laisser l'animation du drawer se terminer
    }
  }, [isExpanded, selectedPOI, visible, onCameraMove, getCameraOffset]);

  // Animation du spinner de chargement
  React.useEffect(() => {
    if (loading) {
      const spinAnimation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      spinAnimation.start();
      return () => spinAnimation.stop();
    } else {
      spinValue.setValue(0);
    }
  }, [loading, spinValue]);

  // Effet pour animer le bouton quand selectedPOI change
  React.useEffect(() => {
    console.log("Sixth useEffect")
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
    console.log(`🎯 User manually selected POI: ${OverpassService.formatPOIName(poi)}`);
    userManualSelectionRef.current = true; // Marquer qu'une sélection manuelle a été faite
    
    // Si on clique sur le POI déjà sélectionné, le déselectionner
    if (selectedPOI?.id === poi.id) {
      setSelectedPOI(null);
      userManualSelectionRef.current = false;
      // Déplacer la caméra vers l'utilisateur quand aucun POI sélectionné
      if (onCameraMove && userLocation) {
        console.log(`📍 handlePOISelect - Deselecting POI, moving to user location`);
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
      
      // TOUJOURS déplacer la caméra vers le POI sélectionné avec offset pour le drawer
      if (onCameraMove) {
        console.log(`📍 handlePOISelect - Moving camera to POI: ${OverpassService.formatPOIName(poi)} at coordinates:`, 
          { latitude: poi.lat, longitude: poi.lon });
        onCameraMove(
          { latitude: poi.lat, longitude: poi.lon }, 
          getCameraOffset()
        );
      }
      
      // Animer le bouton pour l'afficher
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      // Scroll vertical vers le POI sélectionné (environ 2 cartes par ligne)
      const rowIndex = Math.floor(index / 2);
      const cardHeight = 112; // hauteur estimée d'une carte (100 + 12 de margin)
      poiScrollRef.current?.scrollTo({
        y: rowIndex * cardHeight,
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

          {/* Liste des POI en grille 2 colonnes */}
          <View style={styles.poisContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <View style={styles.spinnerContainer}>
                  <Text style={styles.loadingText}>Recherche en cours...</Text>
                  <Animated.View 
                    style={[
                      styles.spinner,
                      {
                        transform: [{
                          rotate: spinValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          })
                        }]
                      }
                    ]}
                  >
                    <Text style={styles.spinnerText}>⟳</Text>
                  </Animated.View>
                </View>
              </View>
            ) : (
              <ScrollView 
                ref={poiScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.poisGridContent}
              >
                <View style={styles.poisGrid}>
                  {pois.map((poi, index) => (
                    <TouchableOpacity
                      key={poi.id}
                      style={[
                        styles.poiGridCard,
                        selectedPOI?.id === poi.id && styles.selectedPoiGridCard,
                      ]}
                      onPress={() => handlePOISelect(poi, index)}
                    >
                      <Text style={styles.poiName} numberOfLines={1}>
                        {OverpassService.formatPOIName(poi)}
                      </Text>
                      <Text style={styles.poiAddress} numberOfLines={2}>
                        {OverpassService.formatPOIAddress(poi) || 'Adresse non disponible'}
                      </Text>
                      <Text style={styles.poiDistance}>
                        {formatDistance(poi.distance || 0)}
                      </Text>
                      
                      {amenityType === '*' && (
                        <Text style={styles.poiType} numberOfLines={1}>
                          {poi.tags.amenity}
                        </Text>
                      )}
                      
                      {poi.tags.opening_hours && (
                        <Text style={styles.poiHours} numberOfLines={1}>
                          {poi.tags.opening_hours}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
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
    flex: 1,
    paddingVertical: 12,
  },
  poisScrollContent: {
    paddingHorizontal: 16,
  },
  poisGridContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  poisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
  poiGridCard: {
    width: '48%',
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 100,
  },
  selectedPoiCard: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  selectedPoiGridCard: {
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
    fontSize: 16,
    marginBottom: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  spinnerContainer: {
    alignItems: 'center',
  },
  spinner: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerText: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: 'bold',
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

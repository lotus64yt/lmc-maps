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
import { FavoritesService } from '@/services/FavoritesService';
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
  preloadedPois?: OverpassPOI[];
  isNavigating?: boolean;
  onAddNavigationStop?: (poi: OverpassPOI) => void;
  onCameraMove?: (coordinate: { latitude: number; longitude: number } | null, offset?: { x: number; y: number }) => void;
}

const DRAWER_MIN_HEIGHT = 400;
const DRAWER_MAX_HEIGHT = 400;

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
  const userManualSelectionRef = useRef(false);

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const animatedHeightsRef = useRef<Record<string, Animated.Value>>({});
  const animatedRotationsRef = useRef<Record<string, Animated.Value>>({});

  const transportModes = [
    { id: 'walking', icon: 'directions-walk', label: 'Marche' },
    { id: 'bicycling', icon: 'directions-bike', label: 'Vélo' },
    { id: 'driving', icon: 'directions-car', label: 'Voiture' },
    { id: 'transit', icon: 'directions-transit', label: 'Transport' },
  ];

  const groupedPOIs = React.useMemo(() => {
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
    
    const sortedGroups: Record<string, OverpassPOI[]> = {};
    Object.keys(groups)
      .sort((a, b) => groups[b].length - groups[a].length)
      .forEach(key => {
        sortedGroups[key] = groups[key].sort((a, b) => (a.distance || 0) - (b.distance || 0));
      });
    
    return sortedGroups;
  }, [pois, amenityType, radius]);

  const getCameraOffset = React.useCallback(() => {
    const offsetY = DRAWER_MIN_HEIGHT;
    return { x: 0, y: offsetY };
  }, []);

  const flatPOIs = React.useMemo(() => {
    return Object.values(groupedPOIs).flat();
  }, [groupedPOIs]);

  React.useEffect(() => {
    Object.keys(groupedPOIs).forEach((key) => {
      if (!animatedHeightsRef.current[key]) {
        animatedHeightsRef.current[key] = new Animated.Value(0);
      }
      if (!animatedRotationsRef.current[key]) {
        animatedRotationsRef.current[key] = new Animated.Value(0);
      }
      setExpandedCategories((prev) => (prev.hasOwnProperty(key) ? prev : { ...prev, [key]: false }));
    });
  }, [groupedPOIs]);

  const toggleCategory = (type: string) => {
    const isExpanded = !!expandedCategories[type];
    const poisOfType = groupedPOIs[type] || [];
    const rows = Math.max(1, Math.ceil(poisOfType.length / 2));
    const cardHeight = 112;
    const contentHeight = rows * cardHeight + 16;

    const heightAnim = animatedHeightsRef.current[type];
    const rotateAnim = animatedRotationsRef.current[type];
    if (!heightAnim || !rotateAnim) return;

    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: isExpanded ? 0 : contentHeight,
        duration: 250,
        useNativeDriver: false,
      }),
      Animated.timing(rotateAnim, {
        toValue: isExpanded ? 0 : 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    setExpandedCategories((prev) => ({ ...prev, [type]: !isExpanded }));
  };

  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const loadFavorites = async () => {
    try {
      const favs = await FavoritesService.listFavorites();
      setFavoriteIds(favs.map(f => f.id));
    } catch (e) {
    }
  };

  React.useEffect(() => {
    loadFavorites();
  }, []);

  const toggleFavoriteForPOI = async (poi: OverpassPOI) => {
    try {
      const favItem = {
        id: poi.id,
        title: OverpassService.formatPOIName(poi),
        subtitle: OverpassService.formatPOIAddress(poi),
        latitude: poi.lat,
        longitude: poi.lon,
        type: 'overpass',
      };
      await FavoritesService.toggleFavorite(favItem);
      await loadFavorites();
    } catch (e) {
    }
  };

  const searchPOIs = React.useCallback(async () => {
    if (!userLocation || hasSearchedRef.current) return;

    hasSearchedRef.current = true;
    lastAmenityTypeRef.current = amenityType;
    setLoading(true);
    
    try {
      const results = await OverpassService.searchPOI(
        userLocation.latitude,
        userLocation.longitude,
        5000,
        amenityType
      );
      setPois(results);
      lastUserLocationRef.current = userLocation;
      
      const filteredResults = results.filter(poi => (poi.distance || 0) <= radius);
      if (filteredResults.length > 0) {
        setSelectedPOI(filteredResults[0]);
        onSelectPOI(filteredResults[0]);
      }
      
      if (onPOIsFound) {
        onPOIsFound(filteredResults);
        notifiedPOIsRef.current = filteredResults;
      }
      
    } catch (error) {
      hasSearchedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [userLocation, amenityType, radius, onSelectPOI, onCameraMove, onPOIsFound, getCameraOffset]);

  React.useEffect(() => {
    if (pois.length > 0) {
      const filteredResults = pois.filter(poi => (poi.distance || 0) <= radius);
      
      if (onPOIsFound && JSON.stringify(filteredResults) !== JSON.stringify(notifiedPOIsRef.current)) {
        onPOIsFound(filteredResults);
        notifiedPOIsRef.current = filteredResults;
      }
      
      if (selectedPOI && filteredResults.length > 0) {
        const isSelectedInRange = filteredResults.some(poi => poi.id === selectedPOI.id);
  if (!isSelectedInRange && !userManualSelectionRef.current) {
          setSelectedPOI(filteredResults[0]);
          onSelectPOI(filteredResults[0]);
        } else if (!isSelectedInRange && userManualSelectionRef.current) {
        }
      } else if (!selectedPOI && filteredResults.length > 0 && !userManualSelectionRef.current) {
        setSelectedPOI(filteredResults[0]);
        onSelectPOI(filteredResults[0]);
      } else if (filteredResults.length === 0) {
        setSelectedPOI(null);
        userManualSelectionRef.current = false;
      }
    }
  }, [radius]);

  React.useEffect(() => {
    if (visible) {
      if (amenityType !== lastAmenityTypeRef.current) {
        hasSearchedRef.current = false;
        lastAmenityTypeRef.current = amenityType;
        setSelectedPOI(null);
        setPois([]);
        notifiedPOIsRef.current = [];
      }
      
      if (preloadedPois && preloadedPois.length > 0 && !hasSearchedRef.current) {
        setPois(preloadedPois);
        hasSearchedRef.current = true;
        lastAmenityTypeRef.current = amenityType;
        
        const filteredResults = preloadedPois.filter(poi => (poi.distance || 0) <= radius);
        if (filteredResults.length > 0) {
          setSelectedPOI(filteredResults[0]);
          onSelectPOI(filteredResults[0]);
        }
        
        if (onPOIsFound) {
          onPOIsFound(filteredResults);
          notifiedPOIsRef.current = filteredResults;
        }
      }
    } else {
      hasSearchedRef.current = false;
      lastAmenityTypeRef.current = '';
      userManualSelectionRef.current = false;
      setSelectedPOI(null);
      setPois([]);
      notifiedPOIsRef.current = [];
    }
  }, [visible, amenityType]);

  React.useEffect(() => {
    if (visible && userLocation && !hasSearchedRef.current && (!preloadedPois || preloadedPois.length === 0)) {
      searchPOIs();
    }
  }, [userLocation, visible, preloadedPois, searchPOIs]);

  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    setRadius(initialRadius);
    setTempRadius(initialRadius);
  }, [initialRadius]);

  React.useEffect(() => {
  }, [visible]);

  React.useEffect(() => {
  }, [isExpanded, selectedPOI, visible, getCameraOffset]);

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

  React.useEffect(() => {
    Animated.timing(buttonOpacity, {
      toValue: selectedPOI ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [selectedPOI]);

  const handleRadiusChange = (newRadius: number) => {
    const roundedRadius = Math.round(newRadius);
    setTempRadius(roundedRadius);
    setRadius(roundedRadius);
    onRadiusChange(roundedRadius);
    
    if (onPOIsFound && pois.length > 0) {
      const filteredResults = pois.filter(poi => (poi.distance || 0) <= roundedRadius);
      onPOIsFound(filteredResults);
    }
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  const handlePOISelect = (poi: OverpassPOI, index: number) => {
    userManualSelectionRef.current = true;
    
    if (selectedPOI?.id === poi.id) {
      setSelectedPOI(null);
      userManualSelectionRef.current = false;
      if (onCameraMove && userLocation) {
        onCameraMove(userLocation);
      }
      Animated.timing(buttonOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
  setSelectedPOI(poi);
  onSelectPOI(poi);
      
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      const rowIndex = Math.floor(index / 2);
      const cardHeight = 112;
      poiScrollRef.current?.scrollTo({
        y: rowIndex * cardHeight,
        animated: true,
      });
    }
  };

  const toggleExpansion = () => {
    const toValue = isExpanded ? DRAWER_MIN_HEIGHT : DRAWER_MAX_HEIGHT;
    setIsExpanded(!isExpanded);
    
    Animated.spring(translateY, {
      toValue,
      useNativeDriver: true,
    }).start();
  };

  const handleShowRoute = () => {
    if (selectedPOI) {
      onShowRoute(selectedPOI, activeTransportMode);
    }
  };

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
          {}
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

          {}
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
                      {amenityType === '*' ? (
                        Object.entries(groupedPOIs).map(([type, poisOfType]) => {
                          const anim = animatedHeightsRef.current[type] || new Animated.Value(0);
                          const rotateAnim = animatedRotationsRef.current[type] || new Animated.Value(0);
                          return (
                            <View key={type} style={styles.categoryBlock}>
                              <TouchableOpacity onPress={() => toggleCategory(type)} style={styles.categoryHeader}>
                                <Text style={styles.categoryTitle}>{type} ({poisOfType.length})</Text>
                                <Animated.View style={{ transform: [{ rotate: rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
                                  <MaterialIcons name="keyboard-arrow-down" size={24} color="#666" />
                                </Animated.View>
                              </TouchableOpacity>

                              <Animated.View style={[styles.categoryContent, { height: anim, overflow: 'hidden' }]}>
                                <View style={styles.poisGridRow}>
                                  {poisOfType.map((poi, idx) => (
                                    <TouchableOpacity
                                      key={poi.id}
                                      style={[
                                        styles.poiGridCard,
                                        selectedPOI?.id === poi.id && styles.selectedPoiGridCard,
                                      ]}
                                      onPress={() => handlePOISelect(poi, idx)}
                                    >
                                      <Text style={styles.poiName} numberOfLines={1}>
                                        {OverpassService.formatPOIName(poi)}
                                      </Text>
                                      <Text style={styles.poiAddress} numberOfLines={2}>
                                        {""}
                                      </Text>
                                      <Text style={styles.poiDistance}>
                                        {formatDistance(poi.distance || 0)}
                                      </Text>
                                      <TouchableOpacity style={styles.favoriteSmall} onPress={() => toggleFavoriteForPOI(poi)}>
                                        <MaterialIcons name={favoriteIds.includes(poi.id) ? 'star' : 'star-border'} size={18} color="#FFB300" />
                                      </TouchableOpacity>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </Animated.View>
                            </View>
                          );
                        })
                      ) : (
                        pois.map((poi, index) => (
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
                              {""}
                            </Text>
                            <Text style={styles.poiDistance}>
                              {formatDistance(poi.distance || 0)}
                            </Text>
                        
                            {poi.tags.opening_hours && (
                              <Text style={styles.poiHours} numberOfLines={1}>
                                {poi.tags.opening_hours}
                              </Text>
                            )}
                            <TouchableOpacity style={styles.favoriteSmall} onPress={() => toggleFavoriteForPOI(poi)}>
                              <MaterialIcons name={favoriteIds.includes(poi.id) ? 'star' : 'star-border'} size={20} color="#FFB300" />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ))
                      )}
                </View>
              </ScrollView>
            )}
          </View>

          {}
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

          {}
          {isExpanded && selectedPOI && (
            <View style={styles.routeSection}>
              <Text style={styles.sectionTitle}>Informations détaillées</Text>
              
              <View style={styles.poiDetails}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.detailTitle}>
                    {OverpassService.formatPOIName(selectedPOI)}
                  </Text>
                  <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => toggleFavoriteForPOI(selectedPOI)}>
                    <MaterialIcons name={favoriteIds.includes(selectedPOI.id) ? 'star' : 'star-border'} size={22} color="#FFB300" />
                  </TouchableOpacity>
                </View>
                
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
              
              {}
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

              {}
              <View style={styles.actionButtons}>
                {}
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

                {}
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
          
          {}
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
  categoryBlock: {
    width: '100%',
    marginBottom: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textTransform: 'capitalize',
  },
  categoryContent: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 0,
  },
  poisGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
  favoriteSmall: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    backgroundColor: 'transparent',
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
  },
  navigateButtonText: {
  },
});


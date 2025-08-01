import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteStep } from '@/types/RouteTypes';
import ExpandableSearch from './ExpandableSearch';
import POIDrawer from './POIDrawer';
import { OverpassPOI } from '@/services/OverpassService';
import { TravelTimeService, TravelTimeResult } from '@/services/TravelTimeService';
import { formatDistance, formatDuration } from '@/utils/formatUtils';

interface MultiStepRouteDrawerProps {
  visible: boolean;
  steps: RouteStep[];
  userLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onAddStep: (step: RouteStep) => void;
  onRemoveStep: (stepId: string) => void;
  onReorderSteps: (steps: RouteStep[]) => void;
  onCalculateRoute: (transportMode: string) => void;
  onStartNavigation: () => void;
  onShowPOIsOnMap?: (pois: OverpassPOI[]) => void;
  onSelectPOIOnMap?: (poi: OverpassPOI) => void;
  totalDistance?: number;
  totalDuration?: number;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MultiStepRouteDrawer({
  visible,
  steps,
  userLocation,
  onClose,
  onAddStep,
  onRemoveStep,
  onReorderSteps,
  onCalculateRoute,
  onStartNavigation,
  onShowPOIsOnMap,
  onSelectPOIOnMap,
  totalDistance,
  totalDuration,
}: MultiStepRouteDrawerProps) {
  const [showAddStep, setShowAddStep] = useState(false);
  const [showPOISelection, setShowPOISelection] = useState(false);
  const [selectedAmenityType, setSelectedAmenityType] = useState('');
  const [activeTransportMode, setActiveTransportMode] = useState('driving');
  const [stepSearch, setStepSearch] = useState('');
  const [stepName, setStepName] = useState('');
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeSegments, setRouteSegments] = useState<TravelTimeResult[]>([]);
  const [showModeComparison, setShowModeComparison] = useState(false);
  const [modeComparison, setModeComparison] = useState<Record<string, TravelTimeResult> | null>(null);

  const transportModes = [
    { id: 'walking', icon: 'directions-walk', label: 'Marche' },
    { id: 'bicycling', icon: 'directions-bike', label: 'Vélo' },
    { id: 'driving', icon: 'directions-car', label: 'Voiture' },
    { id: 'transit', icon: 'directions-transit', label: 'Transport' },
  ];

  const handleAddStepLocation = (result: any) => {
    const newStep: RouteStep = {
      id: Date.now().toString(),
      title: stepName.trim() || result.title,
      subtitle: result.subtitle,
      latitude: result.latitude,
      longitude: result.longitude,
      type: result.type === 'overpass' ? 'poi' : 'address',
      amenityType: result.amenityType,
    };
    
    onAddStep(newStep);
    setShowAddStep(false);
    setStepSearch('');
    setStepName('');
  };

  const handleShowPOI = (amenityType: string) => {
    // Ouvrir le POIDrawer pour sélectionner un POI spécifique
    setSelectedAmenityType(amenityType);
    setShowPOISelection(true);
    setShowAddStep(false); // Fermer le modal d'ajout d'étape
  };

  const formatPOIAddress = (poi: OverpassPOI): string => {
    const { tags } = poi;
    const parts = [];
    
    if (tags.addr_housenumber && tags.addr_street) {
      parts.push(`${tags.addr_housenumber} ${tags.addr_street}`);
    } else if (tags.addr_street) {
      parts.push(tags.addr_street);
    }
    
    if (tags.addr_city) {
      parts.push(tags.addr_city);
    }
    
    return parts.length > 0 ? parts.join(', ') : '';
  };

  const handlePOISelect = (poi: OverpassPOI) => {
    const poiStep: RouteStep = {
      id: Date.now().toString(),
      title: stepName.trim() || poi.tags.name || poi.tags.amenity || 'POI',
      subtitle: formatPOIAddress(poi) || 'Point d\'intérêt',
      latitude: poi.lat,
      longitude: poi.lon,
      type: 'poi',
      amenityType: poi.tags.amenity,
    };
    
    onAddStep(poiStep);
    setShowPOISelection(false);
    setStepSearch('');
    setStepName('');
    setSelectedAmenityType('');
  };

  const handlePOIDrawerClose = () => {
    setShowPOISelection(false);
    setShowAddStep(true); // Revenir au modal d'ajout d'étape
    setSelectedAmenityType('');
  };

  const handlePOIsFound = (pois: OverpassPOI[]) => {
    // Afficher les POI sur la carte
    if (onShowPOIsOnMap) {
      onShowPOIsOnMap(pois);
    }
  };

  const handleSelectPOIOnMap = (poi: OverpassPOI) => {
    // Sélectionner un POI sur la carte
    if (onSelectPOIOnMap) {
      onSelectPOIOnMap(poi);
    }
  };

  const calculateRouteDistance = () => {
    // Calculer la distance approximative de l'itinéraire pour définir le rayon de recherche POI
    if (!userLocation || steps.length === 0) return 5000; // 5km par défaut
    
    let totalRouteDistance = 0;
    let currentLat = userLocation.latitude;
    let currentLng = userLocation.longitude;
    
    // Calculer la distance totale approximative de l'itinéraire
    steps.forEach(step => {
      const distance = Math.sqrt(
        Math.pow(step.latitude - currentLat, 2) + 
        Math.pow(step.longitude - currentLng, 2)
      ) * 111000; // Conversion approximative en mètres
      
      totalRouteDistance += distance;
      currentLat = step.latitude;
      currentLng = step.longitude;
    });
    
    // Retourner un rayon basé sur la distance de l'itinéraire (50% de la distance totale, minimum 1km, maximum 20km)
    return Math.max(1000, Math.min(20000, totalRouteDistance * 0.5));
  };

  const calculateDetailedRoute = async (transportMode: string) => {
    if (!userLocation || steps.length === 0) return;
    
    setIsCalculatingRoute(true);
    
    try {
      // Préparer les waypoints
      const waypoints = steps.map(step => ({
        latitude: step.latitude,
        longitude: step.longitude
      }));
      
      // Calculer le temps de trajet multi-étapes
      const result = await TravelTimeService.calculateMultiStepTravelTime(
        { latitude: userLocation.latitude, longitude: userLocation.longitude },
        waypoints,
        transportMode as any
      );
      
      setRouteSegments(result.segments);
      
      // Notifier le parent avec les nouvelles données
      onCalculateRoute(transportMode);
      
    } catch (error) {
      console.error('Erreur lors du calcul de l\'itinéraire détaillé:', error);
      // Fallback sur le calcul existant
      onCalculateRoute(transportMode);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const getTotalCalculatedTime = (): number => {
    return routeSegments.reduce((total, segment) => total + segment.duration, 0);
  };

  const getTotalCalculatedDistance = (): number => {
    return routeSegments.reduce((total, segment) => total + segment.distance, 0);
  };

  const compareTransportModes = async () => {
    if (!userLocation || steps.length === 0) return;
    
    setIsCalculatingRoute(true);
    
    try {
      // Pour la comparaison, on utilise juste le premier et dernier point
      const destination = steps[steps.length - 1];
      
      const comparison = await TravelTimeService.compareTravelModes(
        { latitude: userLocation.latitude, longitude: userLocation.longitude },
        { latitude: destination.latitude, longitude: destination.longitude }
      );
      
      setModeComparison(comparison);
      setShowModeComparison(true);
    } catch (error) {
      console.error('Erreur lors de la comparaison des modes:', error);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleRemoveStep = (stepId: string) => {
    Alert.alert(
      'Supprimer l\'étape',
      'Êtes-vous sûr de vouloir supprimer cette étape ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => onRemoveStep(stepId) },
      ]
    );
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    const currentIndex = steps.findIndex(step => step.id === stepId);
    if (currentIndex === -1) return;

    const newSteps = [...steps];
    if (direction === 'up' && currentIndex > 0) {
      [newSteps[currentIndex], newSteps[currentIndex - 1]] = 
      [newSteps[currentIndex - 1], newSteps[currentIndex]];
    } else if (direction === 'down' && currentIndex < steps.length - 1) {
      [newSteps[currentIndex], newSteps[currentIndex + 1]] = 
      [newSteps[currentIndex + 1], newSteps[currentIndex]];
    }
    
    onReorderSteps(newSteps);
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
        
        <View style={styles.drawer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Itinéraire multi-étapes</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {/* Résumé du trajet */}
            {(
              (totalDistance && totalDuration && totalDistance > 0 && totalDuration > 0) ||
              (routeSegments.length > 0)
            ) && (
              <View style={styles.summary}>
                <Text style={styles.summaryText}>
                  {routeSegments.length > 0 
                    ? `${formatDistance(getTotalCalculatedDistance())} • ${formatDuration(getTotalCalculatedTime())}`
                    : `${formatDistance(totalDistance || 0)} • ${formatDuration(totalDuration || 0)}`
                  }
                </Text>
                {routeSegments.length > 0 && (
                  <Text style={styles.summarySubtext}>
                    Temps calculé avec {activeTransportMode === 'driving' ? 'voiture' : 
                      activeTransportMode === 'walking' ? 'marche' : 
                      activeTransportMode === 'bicycling' ? 'vélo' : 'transport public'}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Liste des étapes */}
          <ScrollView style={styles.stepsContainer}>
            {/* Point de départ */}
            {userLocation && (
              <View style={styles.stepItem}>
                <View style={styles.stepMarker}>
                  <MaterialIcons name="my-location" size={20} color="#4CAF50" />
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Votre position</Text>
                  <Text style={styles.stepSubtitle}>Point de départ</Text>
                </View>
              </View>
            )}

            {/* Étapes intermédiaires */}
            {steps.map((step, index) => (
              <View style={styles.stepItem}>
                <View style={styles.stepMarker}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                </View>
                
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title || 'Étape sans nom'}</Text>
                  <Text style={styles.stepSubtitle}>{step.subtitle || ''}</Text>
                  {step.type === 'poi' && step.amenityType && (
                    <Text style={styles.stepType}>POI: {step.amenityType}</Text>
                  )}
                  {/* Afficher les détails du segment si disponible */}
                  {routeSegments[index] && (
                    <Text style={styles.segmentInfo}>
                      {formatDistance(routeSegments[index].distance)} • {formatDuration(routeSegments[index].duration)}
                    </Text>
                  )}
                </View>

                <View style={styles.stepActions}>
                  {/* Boutons de réorganisation */}
                  {index > 0 && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => moveStep(step.id, 'up')}
                    >
                      <MaterialIcons name="keyboard-arrow-up" size={20} color="#666" />
                    </TouchableOpacity>
                  )}
                  
                  {index < steps.length - 1 && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => moveStep(step.id, 'down')}
                    >
                      <MaterialIcons name="keyboard-arrow-down" size={20} color="#666" />
                    </TouchableOpacity>
                  )}
                  
                  {/* Bouton supprimer */}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleRemoveStep(step.id)}
                  >
                    <MaterialIcons name="delete" size={20} color="#F44336" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Bouton ajouter une étape */}
            <TouchableOpacity
              style={styles.addStepButton}
              onPress={() => setShowAddStep(true)}
            >
              <MaterialIcons name="add" size={24} color="#007AFF" />
              <Text style={styles.addStepText}>Ajouter une étape</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Modes de transport */}
          <View style={styles.transportSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mode de transport</Text>
              {steps.length > 0 && (
                <TouchableOpacity 
                  style={styles.compareButton}
                  onPress={compareTransportModes}
                  disabled={isCalculatingRoute}
                >
                  <MaterialIcons name="compare-arrows" size={16} color="#007AFF" />
                  <Text style={styles.compareButtonText}>Comparer</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
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
                  onPress={() => {
                    setActiveTransportMode(mode.id);
                    calculateDetailedRoute(mode.id);
                  }}
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
            </ScrollView>
          </View>

          {/* Boutons d'action */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[styles.actionButton, styles.calculateButton]}
              onPress={() => calculateDetailedRoute(activeTransportMode)}
              disabled={isCalculatingRoute}
            >
              <MaterialIcons 
                name={isCalculatingRoute ? "hourglass-empty" : "route"} 
                size={20} 
                color="#FFF" 
              />
              <Text style={styles.calculateButtonText}>
                {isCalculatingRoute ? 'Calcul en cours...' : 'Calculer l\'itinéraire'}
              </Text>
            </TouchableOpacity>
            
            {steps.length > 0 && (
              <TouchableOpacity
                style={[styles.actionButton, styles.startButton]}
                onPress={onStartNavigation}
              >
                <MaterialIcons name="navigation" size={20} color="#FFF" />
                <Text style={styles.startButtonText}>Démarrer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Modal pour ajouter une étape */}
        {showAddStep && (
          <Modal
            animationType="slide"
            transparent={true}
            visible={showAddStep}
            onRequestClose={() => setShowAddStep(false)}
          >
            <View style={styles.searchModal}>
              <View style={styles.searchContainer}>
                <Text style={styles.searchTitle}>Ajouter une étape</Text>
                
                <View style={styles.searchWrapper}>
                  {/* Champ pour le nom personnalisé de l'étape */}
                  <Text style={styles.fieldLabel}>Nom de l'étape (optionnel)</Text>
                  <TextInput
                    style={styles.searchInput}
                    value={stepName}
                    onChangeText={setStepName}
                    placeholder="Ex: Restaurant, Hôtel, Rendez-vous..."
                    returnKeyType="next"
                  />
                  
                  {/* Recherche d'adresse ou POI */}
                  <Text style={styles.fieldLabel}>Adresse ou point d'intérêt</Text>
                  <View style={styles.expandableSearchContainer}>
                    <ExpandableSearch
                      value={stepSearch}
                      onChangeText={setStepSearch}
                      onSelectLocation={handleAddStepLocation}
                      onShowPOI={handleShowPOI}
                      userLocation={userLocation}
                      placeholder="Rechercher une adresse ou un POI..."
                    />
                  </View>
                </View>
                
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddStep(false);
                    setStepSearch('');
                    setStepName('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* POI Selection Drawer */}
        <POIDrawer
          visible={showPOISelection}
          amenityType={selectedAmenityType}
          userLocation={userLocation}
          onClose={handlePOIDrawerClose}
          onSelectPOI={handlePOISelect}
          onShowRoute={(poi, transportMode) => {
            // Gérer l'affichage de l'itinéraire vers le POI si nécessaire
            console.log('Show route to POI:', poi, transportMode);
          }}
          onRadiusChange={(radius) => {
            // Le rayon est géré automatiquement par le POIDrawer
          }}
          onPOIsFound={handlePOIsFound}
          initialRadius={calculateRouteDistance()}
        />

        {/* Modal de comparaison des modes de transport */}
        {showModeComparison && modeComparison && (
          <Modal
            animationType="slide"
            transparent={true}
            visible={showModeComparison}
            onRequestClose={() => setShowModeComparison(false)}
          >
            <View style={styles.comparisonModal}>
              <View style={styles.comparisonContainer}>
                <View style={styles.comparisonHeader}>
                  <Text style={styles.comparisonTitle}>Comparaison des modes de transport</Text>
                  <TouchableOpacity onPress={() => setShowModeComparison(false)}>
                    <MaterialIcons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.comparisonContent}>
                  {Object.entries(modeComparison).map(([mode, result]) => {
                    const modeInfo = transportModes.find(m => m.id === mode);
                    if (!modeInfo) return null;
                    
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[
                          styles.comparisonItem,
                          activeTransportMode === mode && styles.activeComparisonItem
                        ]}
                        onPress={() => {
                          setActiveTransportMode(mode);
                          setShowModeComparison(false);
                          calculateDetailedRoute(mode);
                        }}
                      >
                        <View style={styles.comparisonModeInfo}>
                          <MaterialIcons
                            name={modeInfo.icon as any}
                            size={24}
                            color={activeTransportMode === mode ? '#007AFF' : '#666'}
                          />
                          <Text style={[
                            styles.comparisonModeLabel,
                            activeTransportMode === mode && styles.activeComparisonModeLabel
                          ]}>
                            {modeInfo.label}
                          </Text>
                        </View>
                        
                        <View style={styles.comparisonDetails}>
                          <Text style={styles.comparisonTime}>
                            {formatDuration(result.duration)}
                          </Text>
                          <Text style={styles.comparisonDistance}>
                            {formatDistance(result.distance)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                
                <TouchableOpacity
                  style={styles.comparisonCloseButton}
                  onPress={() => setShowModeComparison(false)}
                >
                  <Text style={styles.comparisonCloseButtonText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
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
    maxHeight: SCREEN_HEIGHT * 0.8,
    paddingBottom: 20,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  summary: {
    backgroundColor: '#F0F8FF',
    padding: 8,
    borderRadius: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
    textAlign: 'center',
  },
  summarySubtext: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  stepsContainer: {
    maxHeight: 300,
    paddingHorizontal: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  stepMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumber: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  stepType: {
    fontSize: 12,
    color: '#9C27B0',
    marginTop: 2,
  },
  segmentInfo: {
    fontSize: 11,
    color: '#007AFF',
    marginTop: 2,
    fontStyle: 'italic',
  },
  stepActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
    marginLeft: 4,
  },
  addStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    marginVertical: 8,
  },
  addStepText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  transportSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  compareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F0F8FF',
    borderRadius: 4,
  },
  compareButtonText: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 4,
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
  actionSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  calculateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 6,
  },
  calculateButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  startButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 6,
  },
  startButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  searchModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    width: '95%',
    maxHeight: '90%',
  },
  searchWrapper: {
    minHeight: 200,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  expandableSearchContainer: {
    minHeight: 60,
    zIndex: 1000,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  cancelButtonText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
  },
  // Styles pour la comparaison des modes de transport
  comparisonModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  comparisonContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '70%',
  },
  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  comparisonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  comparisonContent: {
    maxHeight: 300,
  },
  comparisonItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  activeComparisonItem: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  comparisonModeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  comparisonModeLabel: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  activeComparisonModeLabel: {
    color: '#007AFF',
  },
  comparisonDetails: {
    alignItems: 'flex-end',
  },
  comparisonTime: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  comparisonDistance: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  comparisonCloseButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  comparisonCloseButtonText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
  },
});

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
  ActivityIndicator,
  Vibration,
  Image,
  Modal,
  Clipboard
} from "react-native";
import Icon from 'react-native-vector-icons/MaterialIcons';
import { SpeedLimitService } from '../services/SpeedLimitService';
import * as Location from 'expo-location';
import { NominatimService, NominatimReverseResult } from '../services/NominatimService';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface PlacePhoto {
  url: string;
  title?: string;
  width: number;
  height: number;
}

// Utiliser le type du service au lieu de redéfinir
type LocationInfo = NominatimReverseResult;

interface LocationInfoDrawerProps {
  visible: boolean;
  coordinate: Coordinate | null;
  onClose: () => void;
  onStartRoute: (coordinate: Coordinate) => void;
  hasActiveRoute?: boolean;
  onShowLocationPoint?: (show: boolean) => void;
}

const { height: screenHeight } = Dimensions.get('window');
const DRAWER_HEIGHT = screenHeight * 0.4;
const PEEK_HEIGHT = 80;

export default function LocationInfoDrawer({
  visible,
  coordinate,
  onClose,
  onStartRoute,
  hasActiveRoute = false,
  onShowLocationPoint,
}: LocationInfoDrawerProps) {
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRouteAlert, setShowRouteAlert] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  // Vitesse et limite de vitesse
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const [speedLimit, setSpeedLimit] = useState<string | null>(null);
  // Met à jour la vitesse en temps réel
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    if (visible) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 1, timeInterval: 1000 },
            (loc) => {
              setCurrentSpeed(loc.coords.speed != null ? Math.max(0, loc.coords.speed * 3.6) : null); // m/s -> km/h
            }
          );
        }
      })();
    }
    return () => { sub?.remove(); };
  }, [visible]);

  // Met à jour la limite de vitesse via Overpass API
  useEffect(() => {
    if (visible && coordinate) {
      SpeedLimitService.getSpeedLimit(coordinate.latitude, coordinate.longitude)
        .then((limit) => setSpeedLimit(limit))
        .catch(() => setSpeedLimit(null));
    }
  }, [visible, coordinate]);
  
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const lastRequestTime = useRef<number>(0);

  // Fonction pour récupérer des photos via l'API Unsplash
  const fetchPlacePhotos = async (placeName: string, location: Coordinate) => {
    setPhotosLoading(true);
    try {
      // Nettoyer le nom du lieu pour la recherche
      const cleanPlaceName = placeName
        .replace(/,.*$/, '') // Enlever tout après la première virgule
        .replace(/\d+/g, '') // Enlever les numéros
        .replace(/[^\w\s]/g, '') // Enlever la ponctuation
        .trim();

      // API Unsplash public
      const searchQueries = [
        cleanPlaceName,
        `${cleanPlaceName} architecture`,
        `${cleanPlaceName} street view`,
      ];

      for (const query of searchQueries) {
        try {
          const response = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`,
            {
              headers: {
                'Accept': 'application/json',
              }
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
              const placePhotos: PlacePhoto[] = data.results.slice(0, 3).map((photo: any) => ({
                url: photo.urls.small,
                title: photo.alt_description || photo.description,
                width: photo.width,
                height: photo.height,
              }));
              setPhotos(placePhotos);
              break;
            }
          }
        } catch (err) {continue;
        }
      }

      // Fallback Wikipedia/Wikimedia
      if (photos.length === 0) {
        try {
          const wikiResponse = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(cleanPlaceName)}`
          );
          
          if (wikiResponse.ok) {
            const wikiData = await wikiResponse.json();
            if (wikiData.items && wikiData.items.length > 0) {
              const wikiPhotos: PlacePhoto[] = wikiData.items
                .filter((item: any) => item.type === 'image')
                .slice(0, 2)
                .map((item: any) => ({
                  url: `https://commons.wikimedia.org/wiki/Special:FilePath/${item.title}?width=400`,
                  title: item.title,
                  width: 400,
                  height: 300,
                }));
              setPhotos(wikiPhotos);
            }
          }
        } catch (err) {}
      }

    } catch (err) {
      console.error('Error fetching place photos:', err);
    } finally {
      setPhotosLoading(false);
    }
  };

  // Fetch location info from Nominatim API
  const fetchLocationInfo = async (coord: Coordinate) => {
    setLoading(true);
    setError(null);
    setLocationInfo(null);
    setPhotos([]);

    try {
      const result = await NominatimService.reverse(
        coord.latitude, 
        coord.longitude, 
        { zoom: 18, addressDetails: true }
      );
      
      if (result && result.display_name) {
        setLocationInfo(result);
        
        // Récupérer des photos pour ce lieu
        const placeName = result.display_name.split(',')[0];
        await fetchPlacePhotos(placeName, coord);
      } else {
        setError("Aucune information disponible pour cette location");
      }
    } catch (err) {
      console.error('Error fetching location info:', err);
      setError("Erreur lors de la récupération des informations");
    } finally {
      setLoading(false);
    }
  };

  // Gestion du bouton itinéraire
  const handleStartRoutePress = () => {
    Vibration.vibrate(50); // Vibration légère pour feedback
    if (!coordinate) return;
    
    if (hasActiveRoute) {
      setShowRouteAlert(true);
    } else {
      onStartRoute(coordinate);
    }
  };

  // Confirmer l'abandon de la route actuelle
  const handleConfirmNewRoute = () => {
    Vibration.vibrate(100); // Vibration plus forte pour confirmation
    if (coordinate) {
      setShowRouteAlert(false);
      onStartRoute(coordinate);
    }
  };

  // Annuler l'alerte
  const handleCancelNewRoute = () => {
    Vibration.vibrate(50); // Vibration légère pour annulation
    setShowRouteAlert(false);
  };

  // Fonction pour fermer avec vibration
  const handleCloseWithVibration = () => {
    Vibration.vibrate(50);
    
    // Masquer le point sur la carte
    if (onShowLocationPoint) {
      onShowLocationPoint(false);
    }
    
    onClose();
  };

  // Fonctions de conversion de coordonnées
  const formatCoordinatesDD = (lat: number, lon: number): string => {
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  };

  const formatCoordinatesDMS = (lat: number, lon: number): string => {
    const formatDMS = (coord: number, isLatitude: boolean): string => {
      const abs = Math.abs(coord);
      const degrees = Math.floor(abs);
      const minutes = Math.floor((abs - degrees) * 60);
      const seconds = ((abs - degrees - minutes / 60) * 3600).toFixed(3);
      
      const direction = isLatitude 
        ? (coord >= 0 ? 'N' : 'S')
        : (coord >= 0 ? 'E' : 'W');
      
      return `${degrees}°${minutes}'${seconds}"${direction}`;
    };
    
    return `${formatDMS(lat, true)} ${formatDMS(lon, false)}`;
  };

  const formatCoordinatesDMM = (lat: number, lon: number): string => {
    const formatDMM = (coord: number, isLatitude: boolean): string => {
      const abs = Math.abs(coord);
      const degrees = Math.floor(abs);
      const minutes = ((abs - degrees) * 60).toFixed(4);
      
      const direction = isLatitude 
        ? (coord >= 0 ? 'N' : 'S')
        : (coord >= 0 ? 'E' : 'W');
      
      return `${degrees}°${minutes}'${direction}`;
    };
    
    return `${formatDMM(lat, true)} ${formatDMM(lon, false)}`;
  };

  // Fonction pour copier les coordonnées
  const handleCopyCoordinates = (format: 'DD' | 'DMS' | 'DMM') => {
    if (!coordinate) return;
    
    let formattedCoords: string;
    switch (format) {
      case 'DD':
        formattedCoords = formatCoordinatesDD(coordinate.latitude, coordinate.longitude);
        break;
      case 'DMS':
        formattedCoords = formatCoordinatesDMS(coordinate.latitude, coordinate.longitude);
        break;
      case 'DMM':
        formattedCoords = formatCoordinatesDMM(coordinate.latitude, coordinate.longitude);
        break;
      default:
        formattedCoords = formatCoordinatesDD(coordinate.latitude, coordinate.longitude);
    }
    
    Clipboard.setString(formattedCoords);
    Vibration.vibrate(50);
    setShowCopyModal(false);
    
    // Vous pouvez ajouter un toast ici si vous voulez confirmer la copie
  };

  // Fetch data when coordinate changes
  useEffect(() => {
    if (coordinate) {
      fetchLocationInfo(coordinate);
      
      // Afficher le point sur la carte
      if (onShowLocationPoint) {
        onShowLocationPoint(true);
      }
    }
  }, [coordinate]);

  // Gestion de l'affichage du point quand le drawer devient visible/invisible
  useEffect(() => {
    if (onShowLocationPoint) {
      onShowLocationPoint(visible && !!coordinate);
    }
  }, [visible, coordinate]);

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
        // Masquer le point sur la carte avant de fermer
        if (onShowLocationPoint) {
          onShowLocationPoint(false);
        }
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

  const getLocationIcon = (osmType?: string) => {
    // Utiliser osm_type au lieu de type/category car c'est ce qui est disponible dans NominatimReverseResult
    switch (osmType) {
      case 'node':
        return 'place';  
      case 'way':
        return 'route'; // Changé de 'road' vers 'route'
      case 'relation':
        return 'location-city';
      default:
        return 'location-on';
    }
  };

  const getLocationTitle = (locationInfo: LocationInfo): string => {
    // Extraire un titre intelligent depuis display_name
    const parts = locationInfo.display_name.split(',');
    if (parts.length > 0) {
      // Prendre la première partie comme titre
      return parts[0].trim();
    }
    return 'Lieu';
  };

  const formatAddress = (address: any) => {
    if (!address) return '';
    
    const parts = [];
    if (address.house_number && address.road) {
      parts.push(`${address.house_number} ${address.road}`);
    } else if (address.road) {
      parts.push(address.road);
    }
    
    if (address.neighbourhood) parts.push(address.neighbourhood);
    if (address.city) parts.push(address.city);
    if (address.postcode) parts.push(address.postcode);
    
    return parts.join(', ');
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
        <TouchableOpacity onPress={handleCloseWithVibration} style={styles.closeButton}>
          <Icon name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Récupération des informations...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Icon name="error-outline" size={48} color="#FF3B30" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Affichage compteur de vitesse en mode navigation */}
        {visible && currentSpeed !== null && (
          <View style={styles.speedContainer}>
            <Icon name="speed" size={22} color="#007AFF" style={{marginRight: 6}} />
            <Text style={styles.speedText}>{currentSpeed.toFixed(0)} km/h</Text>
            {speedLimit && (
              <Text style={styles.speedLimitText}>/ {speedLimit} km/h</Text>
            )}
          </View>
        )}

        {locationInfo && !loading && (
          <View style={styles.infoContainer}>
            <View style={styles.titleRow}>
              <Icon 
                name={getLocationIcon(locationInfo.osm_type)} 
                size={24} 
                color="#007AFF" 
              />
              <Text style={styles.title}>
                {getLocationTitle(locationInfo)}
              </Text>
            </View>

            {locationInfo.address && (
              <Text style={styles.address}>
                {formatAddress(locationInfo.address)}
              </Text>
            )}

            <Text style={styles.displayName}>
              {locationInfo.display_name}
            </Text>

            {/* Photos du lieu */}
            {photos.length > 0 && (
              <View style={styles.photosContainer}>
                <Text style={styles.photosTitle}>Photos du lieu</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {photos.map((photo, index) => (
                    <View key={index} style={styles.photoContainer}>
                      <Image 
                        source={{ uri: photo.url }} 
                        style={styles.photo}
                        resizeMode="cover"
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {photosLoading && (
              <View style={styles.photosLoadingContainer}>
                <ActivityIndicator size="small" color="#666" />
                <Text style={styles.photosLoadingText}>Chargement des photos...</Text>
              </View>
            )}

            {coordinate && (
              <View style={styles.coordinatesContainer}>
                <View style={styles.coordinatesHeader}>
                  <Text style={styles.coordinatesTitle}>Coordonnées:</Text>
                  <TouchableOpacity 
                    style={styles.copyButton}
                    onPress={() => setShowCopyModal(true)}
                  >
                    <Icon name="content-copy" size={16} color="#007AFF" />
                    <Text style={styles.copyButtonText}>Copier</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.coordinates}>
                  {coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}
                </Text>
              </View>
            )}

            {locationInfo.osm_type && (
              <View style={styles.typeContainer}>
                <Text style={styles.typeTitle}>Type OSM:</Text>
                <Text style={styles.typeText}>{locationInfo.osm_type}</Text>
              </View>
            )}

            {/* Bouton pour lancer l'itinéraire */}
            <TouchableOpacity 
              style={styles.routeButton}
              onPress={handleStartRoutePress}
            >
              <Icon name="directions" size={24} color="white" />
              <Text style={styles.routeButtonText}>Itinéraire vers ce lieu</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Modal pour choisir le format de copie des coordonnées */}
      {showCopyModal && (
        <View style={styles.alertOverlay}>
          <View style={styles.copyModalContainer}>
            <View style={styles.copyModalHeader}>
              <Icon name="content-copy" size={24} color="#007AFF" />
              <Text style={styles.copyModalTitle}>Copier les coordonnées</Text>
            </View>
            <Text style={styles.copyModalSubtitle}>
              Choisissez le format de coordonnées à copier :
            </Text>
            
            <TouchableOpacity 
              style={styles.copyFormatButton}
              onPress={() => handleCopyCoordinates('DD')}
            >
              <View style={styles.copyFormatContent}>
                <Text style={styles.copyFormatTitle}>DD (Degrés décimaux)</Text>
                <Text style={styles.copyFormatExample}>
                  {coordinate ? formatCoordinatesDD(coordinate.latitude, coordinate.longitude) : '45.123456, -74.123456'}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.copyFormatButton}
              onPress={() => handleCopyCoordinates('DMS')}
            >
              <View style={styles.copyFormatContent}>
                <Text style={styles.copyFormatTitle}>DMS (Degrés, Minutes, Secondes)</Text>
                <Text style={styles.copyFormatExample}>
                  {coordinate ? formatCoordinatesDMS(coordinate.latitude, coordinate.longitude) : '45°7\'22.032"N 74°7\'22.032"W'}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.copyFormatButton}
              onPress={() => handleCopyCoordinates('DMM')}
            >
              <View style={styles.copyFormatContent}>
                <Text style={styles.copyFormatTitle}>DMM (Degrés, Minutes décimales)</Text>
                <Text style={styles.copyFormatExample}>
                  {coordinate ? formatCoordinatesDMM(coordinate.latitude, coordinate.longitude) : '45°7.3672\'N 74°7.3672\'W'}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.copyModalCancelButton}
              onPress={() => setShowCopyModal(false)}
            >
              <Text style={styles.copyModalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Alerte personnalisée pour confirmer l'abandon de route */}
      {showRouteAlert && (
        <View style={styles.alertOverlay}>
          <View style={styles.alertContainer}>
            <View style={styles.alertHeader}>
              <Icon name="warning" size={32} color="#FF9500" />
              <Text style={styles.alertTitle}>Nouvelle route</Text>
            </View>
            <Text style={styles.alertMessage}>
              Une route est déjà en cours. Voulez-vous l'abandonner pour créer un nouvel itinéraire ?
            </Text>
            <View style={styles.alertButtons}>
              <TouchableOpacity 
                style={[styles.alertButton, styles.cancelButton]}
                onPress={handleCancelNewRoute}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.alertButton, styles.confirmButton]}
                onPress={handleConfirmNewRoute}
              >
                <Text style={styles.confirmButtonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  speedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 4,
  },
  speedLimitText: {
    fontSize: 16,
    color: '#FF3B30',
    fontWeight: '600',
    marginLeft: 2,
  },
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
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
  infoContainer: {
    paddingVertical: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  address: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  displayName: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  coordinatesContainer: {
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  coordinatesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  coordinatesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  copyButtonText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
    marginLeft: 4,
  },
  coordinates: {
    fontSize: 14,
    color: '#007AFF',
    fontFamily: 'monospace',
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  typeText: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  // Styles pour le bouton d'itinéraire
  routeButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    marginHorizontal: 4,
  },
  routeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Styles pour l'alerte personnalisée
  alertOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    height: '70%',
  },
  alertContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    maxWidth: 320,
    width: '100%',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
  },
  alertMessage: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  alertButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  alertButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F2F2F7',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Styles pour les photos
  photosContainer: {
    marginBottom: 16,
  },
  photosTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  photoContainer: {
    marginRight: 12,
    width: 180,
  },
  photo: {
    width: 180,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  photoTitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  photosLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginBottom: 16,
  },
  photosLoadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  // Styles pour le modal de copie de coordonnées
  copyModalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    maxWidth: 400,
    width: '100%',
  },
  copyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  copyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
  },
  copyModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  copyFormatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  copyFormatContent: {
    flex: 1,
  },
  copyFormatTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  copyFormatExample: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'monospace',
  },
  copyModalCancelButton: {
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
  },
  copyModalCancelText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
});

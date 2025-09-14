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
  Linking
} from "react-native";
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { NominatimService, NominatimReverseResult } from '../services/NominatimService';
import ParkingService, { ParkingSpot } from '../services/ParkingService';

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

interface ArrivalDrawerProps {
  visible: boolean;
  destination: {
    coordinate: Coordinate;
    name?: string;
    address?: string;
  } | null;
  onClose: () => void;
  onNavigateAgain?: () => void;
  onDisableFollowUser?: () => void;
  onEnableFollowUser?: () => void;
  onAdjustCamera?: (coordinate: Coordinate) => void;
  onFindParking?: (location: Coordinate) => void;
  onClearSteps?: () => void;
}

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
const DRAWER_HEIGHT = screenHeight * 0.65;

export default function ArrivalDrawer({
  visible,
  destination,
  onClose,
  onNavigateAgain,
  onDisableFollowUser,
  onEnableFollowUser,
  onAdjustCamera,
  onFindParking,
  onClearSteps,
}: ArrivalDrawerProps) {
  const [locationInfo, setLocationInfo] = useState<NominatimReverseResult | null>(null);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isInParis, setIsInParis] = useState(false);
  
  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;

  const fetchPlacePhotos = async (placeName: string, location: Coordinate) => {
    setPhotosLoading(true);
    try {
      const cleanPlaceName = placeName
        .replace(/,.*$/, '')
        .replace(/\d+/g, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      const searchQueries = [
        cleanPlaceName,
        `${cleanPlaceName} architecture`,
        `${cleanPlaceName} street view`,
      ];

      let foundPhotos = false;

      for (const query of searchQueries) {
        if (foundPhotos) break;
        
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
              foundPhotos = true;
}
          }
        } catch (err) {
continue;
        }
      }

      if (!foundPhotos) {
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
        } catch (err) {
}
      }

    } catch (err) {
    } finally {
      setPhotosLoading(false);
    }
  };

  const fetchDestinationInfo = async (coord: Coordinate) => {
    setLoading(true);
    setError(null);
    setLocationInfo(null);
    setPhotos([]);

    try {
      const inParis = ParkingService.isInParis(coord.latitude, coord.longitude);
      setIsInParis(inParis);
    } catch (e) {
      setIsInParis(false);
    }

    try {
      const result = await NominatimService.reverse(
        coord.latitude, 
        coord.longitude, 
        { zoom: 18, addressDetails: true }
      );
      
      if (result && result.display_name) {
        setLocationInfo(result);
        setDataLoaded(true);
        
        const placeName = destination?.name || result.display_name.split(',')[0];
        await fetchPlacePhotos(placeName, coord);
      } else {
        setError("Aucune information disponible pour cette destination");
        setDataLoaded(true);
      }
    } catch (err) {
      setError("Erreur lors de la récupération des informations");
      setDataLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseWithVibration = () => {
    Vibration.vibrate([100, 50, 100]);
    
    if (onEnableFollowUser) {
      onEnableFollowUser();
    }
    
    onClose();
  };

  const handleNavigateAgain = () => {
    Vibration.vibrate(50);
    if (onNavigateAgain) {
      onNavigateAgain();
    }
  };

  const handleFindParking = () => {
    Vibration.vibrate(50);
    if (!onFindParking) return;

    let coord: Coordinate | null = null;
    if (destination && destination.coordinate) {
      coord = destination.coordinate;
    } else if (locationInfo && locationInfo.lat && locationInfo.lon) {
      coord = { latitude: parseFloat(locationInfo.lat), longitude: parseFloat(locationInfo.lon) };
    }

    if (coord) {
      onFindParking(coord);
    } else {
      alert('Coordonnée introuvable pour la recherche de parking.');
    }
  };

  useEffect(() => {
    if (visible && destination?.coordinate && !dataLoaded) {
      fetchDestinationInfo(destination.coordinate);
    }
  }, [visible, destination?.coordinate?.latitude, destination?.coordinate?.longitude, dataLoaded]);

  useEffect(() => {
    if (visible && destination?.coordinate && dataLoaded) {
      try {
        const inParis = ParkingService.isInParis(destination.coordinate.latitude, destination.coordinate.longitude);
        if (inParis !== isInParis) {
          setIsInParis(inParis);
        }
      } catch (e) {
        setIsInParis(false);
      }
    }
  }, [visible, destination?.coordinate, dataLoaded]);

  useEffect(() => {
    if (destination?.coordinate?.latitude && destination?.coordinate?.longitude) {
      const newLatLng = `${destination.coordinate.latitude},${destination.coordinate.longitude}`;
      const currentLatLng = locationInfo ? `${locationInfo.lat || 0},${locationInfo.lon || 0}` : '';
      
      const latDiff = Math.abs(destination.coordinate.latitude - parseFloat(locationInfo?.lat || '0'));
      const lonDiff = Math.abs(destination.coordinate.longitude - parseFloat(locationInfo?.lon || '0'));
      const tolerance = 0.0001;
      
      if (latDiff > tolerance || lonDiff > tolerance) {
         setDataLoaded(false);
         setLocationInfo(null);
         setPhotos([]);
         setError(null);
         setIsInParis(false);
      } else {
}
    }
  }, [destination?.coordinate?.latitude, destination?.coordinate?.longitude]);

  useEffect(() => {
if (destination?.coordinate) {
      const testInParis = ParkingService.isInParis(destination.coordinate.latitude, destination.coordinate.longitude);
}
  }, [isInParis]);

  const hasOpenedRef = useRef(false);
  useEffect(() => {
    if (visible && !hasOpenedRef.current) {
      hasOpenedRef.current = true;

      if (onClearSteps) {
        onClearSteps();
      }

      if (onDisableFollowUser) {
        onDisableFollowUser();
      }

      if (destination?.coordinate && onAdjustCamera) {
        const adjustedCoordinate = {
          latitude: destination.coordinate.latitude + 0.001,
          longitude: destination.coordinate.longitude,
        };
        onAdjustCamera(adjustedCoordinate);
      }

      Animated.spring(translateY, {
        toValue: screenHeight - DRAWER_HEIGHT,
        useNativeDriver: true,
        bounciness: 8,
        speed: 12,
      }).start();
    }

    if (!visible && hasOpenedRef.current) {
      hasOpenedRef.current = false;
      Animated.spring(translateY, {
        toValue: screenHeight,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    }
  }, [visible, destination?.coordinate]);

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
        if (onEnableFollowUser) {
          onEnableFollowUser();
        }
        onClose();
      } else {
        Animated.spring(translateY, {
          toValue: screenHeight - DRAWER_HEIGHT,
          useNativeDriver: true,
          bounciness: 8,
        }).start();
      }
    },
  });

  const getDestinationName = (): string => {
    if (destination?.name) return destination.name;
    if (locationInfo?.display_name) {
      return locationInfo.display_name.split(',')[0].trim();
    }
    return "votre destination";
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
        {}
        <View style={styles.celebrationHeader}>
          <View style={styles.successIconContainer}>
            <Icon name="check-circle" size={48} color="#4CAF50" />
          </View>
          <Text style={styles.arrivalTitle}>Vous êtes arrivé !</Text>
          <Text style={styles.destinationName}>
            {getDestinationName()}
          </Text>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Récupération des informations...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Icon name="error-outline" size={48} color="#FF3B30" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {locationInfo && !loading && (
          <View style={styles.infoContainer}>
            {}
            {locationInfo.address && (
              <View style={styles.addressContainer}>
                <Icon name="location-on" size={20} color="#666" />
                <Text style={styles.address}>
                  {formatAddress(locationInfo.address)}
                </Text>
              </View>
            )}

            {}
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
                      {photo.title && (
                        <Text style={styles.photoTitle} numberOfLines={2}>
                          {photo.title}
                        </Text>
                      )}
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

            {}
            {destination?.coordinate && (
              <View style={styles.coordinatesContainer}>
                <Icon name="my-location" size={16} color="#666" />
                <Text style={styles.coordinates}>
                  {destination.coordinate.latitude.toFixed(6)}, {destination.coordinate.longitude.toFixed(6)}
                </Text>
              </View>
            )}

            {}
            {locationInfo.osm_type && (
              <View style={styles.typeContainer}>
                <Icon name="info-outline" size={16} color="#666" />
                <Text style={styles.typeText}>Type: {locationInfo.osm_type}</Text>
              </View>
            )}
          </View>
        )}

        {}
        <View style={styles.actionsContainer}>
          {onNavigateAgain && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.navigateButton]}
              onPress={handleNavigateAgain}
            >
              <Icon name="directions" size={24} color="white" />
              <Text style={styles.actionButtonText}>Naviguer à nouveau</Text>
            </TouchableOpacity>
          )}

            {onFindParking && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.parkingButton]}
              onPress={handleFindParking}
            >
              <Icon name="local-parking" size={24} color="white" />
              <Text style={styles.actionButtonText}>Trouver un parking</Text>
            </TouchableOpacity>
            )}
        </View>

        <View style={styles.congratsContainer}>
          <Text style={styles.congratsText}>
            Félicitations ! Vous avez atteint votre destination.
          </Text>
          {isInParis && (
            <Text style={styles.parisInfo}>
              🅿️ Service de parking disponible à Paris
            </Text>
          )}
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
  celebrationHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  successIconContainer: {
    marginBottom: 12,
  },
  arrivalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
  destinationName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    paddingHorizontal: 16,
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
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  address: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
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
    width: 200,
  },
  photo: {
    width: 200,
    height: 120,
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
  },
  photosLoadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  coordinatesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  coordinates: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    marginLeft: 8,
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  typeText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
    textTransform: 'capitalize',
  },
  actionsContainer: {
    paddingVertical: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  navigateButton: {
    backgroundColor: '#007AFF',
  },
  parkingButton: {
    backgroundColor: '#FF9500',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  congratsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: 40,
  },
  congratsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 16,
  },
  parisInfo: {
    fontSize: 14,
    color: '#FF9500',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
});


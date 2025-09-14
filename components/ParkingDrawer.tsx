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
} from "react-native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import ParkingService, {
  ParkingSpot,
  ParkingSearchResult,
} from "../services/ParkingService";
import { useMapView } from "@/contexts/MapViewContext";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface ParkingDrawerProps {
  visible: boolean;
  searchLocation: Coordinate | null;
  onClose: () => void;
  onParkingSelect: (parking: ParkingSpot) => void;
  onNavigateToParking?: (parking: ParkingSpot, useExactSpot?: boolean) => void;
}

const { height: screenHeight } = Dimensions.get("window");
const DRAWER_HEIGHT = screenHeight * 0.7;

export default function ParkingDrawer({
  visible,
  searchLocation,
  onClose,
  onParkingSelect,
  onNavigateToParking,
}: ParkingDrawerProps) {
  const mapView = useMapView();
  const [searchResult, setSearchResult] = useState<ParkingSearchResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedParking, setSelectedParking] = useState<ParkingSpot | null>(
    null
  );
  const [searchingExactSpot, setSearchingExactSpot] = useState(false);

  const translateY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const footerTranslateY = useRef(new Animated.Value(180)).current;
  const footerScale = useRef(new Animated.Value(1)).current;

  const searchParkings = async (location: Coordinate) => {
    setLoading(true);
    setError(null);
    setSearchResult(null);
    setSelectedParking(null);

    try {
      const result = await ParkingService.findNearbyParkings(
        location.latitude,
        location.longitude,
        2
      );
      setSearchResult(result);

      if (result.parkings.length === 0) {
        setError("Aucun parking trouvé dans cette zone");
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de la recherche de parkings");
    } finally {
      setLoading(false);
    }
  };

  const handleParkingSelect = (parking: ParkingSpot) => {
    Vibration.vibrate(50);
    if (selectedParking && selectedParking.id === parking.id) {
      setSelectedParking(null);
      return;
    }

    setSelectedParking(parking);
    onParkingSelect(parking);
  };

  const handleNavigateToParking = async (useExactSpot: boolean = false) => {
    if (!selectedParking || !onNavigateToParking) return;

    try {
      if (useExactSpot) {
        setSearchingExactSpot(true);
        const parkingWithExactSpot = await ParkingService.getExactParkingSpot(
          selectedParking
        );
        if (parkingWithExactSpot) {
          onNavigateToParking(parkingWithExactSpot, true);
        } else {
          onNavigateToParking(selectedParking, false);
        }
        setSearchingExactSpot(false);
      } else {
        onNavigateToParking(selectedParking, false);
      }
    } catch (error) {
      setSearchingExactSpot(false);
      onNavigateToParking(selectedParking, false);
    }
  };

  useEffect(() => {
    if (visible && searchLocation) {
      searchParkings(searchLocation);
    }
  }, [visible, searchLocation]);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: screenHeight - DRAWER_HEIGHT,
        useNativeDriver: true,
        bounciness: 8,
        speed: 12,
      }).start();
    } else {
      Animated.spring(translateY, {
        toValue: screenHeight,
        useNativeDriver: true,
      }).start();
      setSelectedParking(null);
      footerTranslateY.setValue(180);
    }
  }, [visible]);

  useEffect(() => {
    if (selectedParking) {
      footerTranslateY.setValue(180);
      footerScale.setValue(0.98);
      Animated.parallel([
        Animated.spring(footerTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 6,
          tension: 80,
        }),
        Animated.spring(footerScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
          tension: 80,
        }),
      ]).start();
    } else {
      Animated.timing(footerTranslateY, {
        toValue: 180,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedParking]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
    },
    onPanResponderMove: (evt, gestureState) => {
      const newValue = screenHeight - DRAWER_HEIGHT + gestureState.dy;
      if (
        newValue >= screenHeight - DRAWER_HEIGHT &&
        newValue <= screenHeight
      ) {
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
          bounciness: 8,
        }).start();
      }
    },
  });

  const renderParkingItem = (parking: ParkingSpot) => {
    const isSelected = selectedParking?.id === parking.id;
    const availabilityColor = parking.availableSpaces
      ? parking.availableSpaces > 10
        ? "#4CAF50"
        : parking.availableSpaces > 5
        ? "#FF9800"
        : "#F44336"
      : "#666";

    return (
      <TouchableOpacity
        key={parking.id}
        style={[styles.parkingItem, isSelected && styles.selectedParkingItem]}
        onPress={() => handleParkingSelect(parking)}
      >
        <View style={styles.parkingHeader}>
          <View style={styles.parkingIconContainer}>
            <Icon
              name={ParkingService.getParkingIcon(parking.type) as any}
              size={24}
              color={isSelected ? "#007AFF" : "#666"}
            />
          </View>
          <View style={styles.parkingInfo}>
            <Text
              style={[styles.parkingName, isSelected && styles.selectedText]}
            >
              {parking.name}
            </Text>
            <Text style={styles.parkingAddress}>{parking.address}</Text>
            <Text style={styles.parkingProvider}>
              {parking.provider} •{" "}
              {parking.distance
                ? ParkingService.formatDistance(parking.distance)
                : ""}
            </Text>
          </View>
          <View style={styles.parkingStats}>
            {parking.availableSpaces !== undefined && (
              <View
                style={[
                  styles.availabilityBadge,
                  { backgroundColor: availabilityColor },
                ]}
              >
                <Text style={styles.availabilityText}>
                  {parking.availableSpaces} places
                </Text>
              </View>
            )}
            {parking.pricePerHour && (
              <Text style={styles.priceText}>
                {parking.pricePerHour.toFixed(2)}€/h
              </Text>
            )}
          </View>
          {parking.features && parking.features.length > 0 && (
            <View style={styles.featuresContainer}>
              {parking.features.map((feature, index) => (
                <View key={index} style={styles.featureBadge}>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
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
        <View style={styles.headerContent}>
          <Icon name="local-parking" size={24} color="#007AFF" />
          <Text style={styles.title}>Parkings à proximité</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Icon name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

  <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 180 }} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Recherche de parkings...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Icon name="error-outline" size={48} color="#FF3B30" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {searchResult && !loading && (
          <View>
            <Text style={styles.resultsText}>
              {searchResult.parkings.length} parking
              {searchResult.parkings.length > 1 ? "s" : ""} trouvé
              {searchResult.parkings.length > 1 ? "s" : ""}
            </Text>

            {searchResult.parkings.map(renderParkingItem)}
          </View>
        )}

  {}
      </ScrollView>

      {}
      {selectedParking && (
        <Animated.View
          style={[
            styles.footerContainer,
            {
              transform: [
                { translateY: footerTranslateY },
                { scale: footerScale },
              ],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.footerContent}>
            <Text style={styles.actionTitle}>Actions pour {selectedParking.name}</Text>
            <View style={styles.footerButtonsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.navigateButton, { flex: 1 }]}
                onPress={() => handleNavigateToParking(false)}
              >
                <Icon name="directions" size={20} color="white" />
                <Text style={styles.actionButtonText}>Naviguer vers l'entrée</Text>
              </TouchableOpacity>

              {(selectedParking.provider === "Q-Park" || selectedParking.provider === "Saemes") && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.exactSpotButton, { marginLeft: 12, width: 140 }]}
                  onPress={() => handleNavigateToParking(true)}
                  disabled={searchingExactSpot}
                >
                  {searchingExactSpot ? (
                    <ActivityIndicator size={18} color="white" />
                  ) : (
                    <Icon name="my-location" size={18} color="white" />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  handle: {
    position: "absolute",
    top: 6,
    left: "50%",
    marginLeft: -20,
    width: 40,
    height: 4,
    backgroundColor: "#C7C7CC",
    borderRadius: 2,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginLeft: 8,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: "#FF3B30",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  resultsText: {
    fontSize: 14,
    color: "#666",
    marginVertical: 16,
    textAlign: "center",
  },
  parkingItem: {
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedParkingItem: {
    backgroundColor: "#E3F2FD",
    borderColor: "#007AFF",
  },
  parkingHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  parkingIconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  parkingInfo: {
    flex: 1,
  },
  parkingName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  selectedText: {
    color: "#007AFF",
  },
  parkingAddress: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  parkingProvider: {
    fontSize: 12,
    color: "#888",
  },
  parkingStats: {
    alignItems: "flex-end",
  },
  availabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  availabilityText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  priceText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  featuresContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 6,
  },
  featureBadge: {
    backgroundColor: "#E0E0E0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featureText: {
    fontSize: 12,
    color: "#555",
  },
  actionsContainer: {
    marginTop: 20,
    marginBottom: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  navigateButton: {
    backgroundColor: "#007AFF",
  },
  exactSpotButton: {
    backgroundColor: "#4CAF50",
  },
  actionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  footerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: 'center',
    paddingHorizontal: 16,
    pointerEvents: 'box-none',
  },
  footerContent: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },
  footerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
});


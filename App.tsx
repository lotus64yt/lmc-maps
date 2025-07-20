import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Dimensions,
  Image,
  TouchableOpacity,
  Text,
  TextInput,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Animated } from "react-native";

export default function Map() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [search, setSearch] = useState("");
  const [routeInfo, setRouteInfo] = useState<{ duration: number; instruction: string } | null>(null);

  const headingAnim = useRef(new Animated.Value(0)).current;
  const lastHeading = useRef(0);
  const mapRef = useRef<MapView>(null);

  interface Coordinate {
    latitude: number;
    longitude: number;
  }

  const animateHeading = (newHeading: number) => {
    const delta = Math.abs(newHeading - lastHeading.current);
    if (delta > 180) {
      if (newHeading > lastHeading.current) {
        lastHeading.current += 360;
      } else {
        newHeading += 360;
      }
    }
    Animated.timing(headingAnim, {
      toValue: newHeading,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      lastHeading.current = newHeading % 360;
      headingAnim.setValue(lastHeading.current);
    });
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 1 },
        (loc) => setLocation(loc.coords)
      );
      Location.watchHeadingAsync((h) => {
        if (h.accuracy >= 0) {
          const newHeading = h.trueHeading ?? h.magHeading;
          animateHeading(newHeading);
        }
      });
    })();
  }, []);

  const handleLongPress = async (e: { nativeEvent: { coordinate: Coordinate } }) => {
    const coord = e.nativeEvent.coordinate;
    setDestination(coord);
    if (location)
      getRoute(
        [location.longitude, location.latitude],
        [coord.longitude, coord.latitude]
      );
  };

  const getRoute = async (start: number[], end: number[]) => {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.join(",")};${end.join(",")}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();
    const coords = (
      data.routes[0].geometry.coordinates as [number, number][]
    ).map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    }));
    setRouteCoords(coords);
    const duration = Math.round(data.routes[0].duration / 60);
    const instruction = data.routes[0].legs[0].steps[0]?.maneuver?.instruction ?? "N/A";
    setRouteInfo({ duration, instruction });
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json`);
    const data = await res.json();
    if (data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      const coord = { latitude: lat, longitude: lon };
      setDestination(coord);
      if (location) getRoute([location.longitude, location.latitude], [lon, lat]);
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lon, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    }
  };

  const recenterMap = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Rechercher un lieu..."
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={handleSearch}
      />
      {location && (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onLongPress={handleLongPress}
            showsUserLocation={false}
          >
            <Marker
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              style={{ transform: [{ rotate: `${heading}deg` }] }}
            >
              <Animated.Image
                source={require("@/assets/arrow.png")}
                style={{
                  width: 40,
                  height: 40,
                  transform: [
                    {
                      rotate: headingAnim.interpolate({
                        inputRange: [0, 360],
                        outputRange: ["180deg", "540deg"],
                      }),
                    },
                  ],
                }}
                resizeMode="contain"
              />
            </Marker>
            {destination && <Marker coordinate={destination} pinColor="green" />}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeWidth={4} strokeColor="blue" />
            )}
          </MapView>

          <TouchableOpacity onPress={recenterMap} style={styles.recenterButton}>
            <Text style={styles.recenterText}>🧭</Text>
          </TouchableOpacity>

          {routeInfo && (
            <TouchableOpacity style={styles.routeButton}>
              <Text style={styles.routeText}>
                🚗 Démarrer | {routeInfo.duration} min - {routeInfo.instruction}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  searchInput: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    elevation: 4,
  },
  recenterButton: {
    position: "absolute",
    bottom: 40,
    right: 20,
    backgroundColor: "white",
    borderRadius: 30,
    padding: 12,
    elevation: 4,
  },
  recenterText: {
    fontSize: 22,
  },
  routeButton: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    elevation: 4,
  },
  routeText: {
    fontSize: 16,
    textAlign: "center",
  },
});

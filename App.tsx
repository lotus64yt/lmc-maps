import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Modal,
  Alert,
  Dimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import { parseGPX } from "./utils/gpxParser";

function getDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const aVal =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return R * c;
}
import MapContainer from "./components/MapContainer";
import ControlButtons from "./components/ControlButtons";
import ExpandableSearch from "./components/ExpandableSearch";
import GPXDrawer from "./components/GPXDrawer";
import GPXStartDrawer from "./components/GPXStartDrawer";
import RouteDrawer from "./components/RouteDrawer";
import POIDrawer from "./components/POIDrawer";
import MultiStepRouteDrawer from "./components/MultiStepRouteDrawer";
import NavigationGuidance from "./components/NavigationGuidance";
import ProgressSidebar from "./components/ProgressSidebar";
import LocationInfoDrawer from "./components/LocationInfoDrawer";
import FavoritesDrawer from "./components/FavoritesDrawer";
import NavigationStepDrawer from "./components/NavigationStepDrawer";
import ArrivalDrawer from "./components/ArrivalDrawer";
import ParkingDrawer from "./components/ParkingDrawer";
import { MapViewProvider } from "./contexts/MapViewContext";
import { LabsProvider } from "./contexts/LabsContext";
import { useLocationAndNavigation } from "./hooks/useLocationAndNavigation";
import { useMapControls } from "./hooks/useMapControls";
import { OverpassPOI, OverpassService } from "./services/OverpassService";
import { RouteStep } from "./types/RouteTypes";
import { Coordinate, NavigationData } from "./services/RouteService";
import { fetchParallelRouting } from "./services/RouteService";
import NavigationService from "./services/NavigationService";
import { LastTripStorage, LastTripData } from "./services/LastTripStorage";
import ResumeTripModal from "./components/ResumeTripModal";
import { SafetyTestConfig } from "./config/SafetyTestConfig";

export default function Map() {
  return (
    <LabsProvider>
      <MapViewProvider>
        <MapContent />
      </MapViewProvider>
    </LabsProvider>
  );
}

function MapContent() {
  const [showLocationTimeoutModal, setShowLocationTimeoutModal] =
    useState(false);
  const [locationTimeoutId, setLocationTimeoutId] =
    useState<NodeJS.Timeout | null>(null);

  const handleRetryLocation = async () => {
    setShowLocationTimeoutModal(false);
    setLocationTimeoutId(null);
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch (e) {}
  };

  const handleContinueWithoutLocation = () => {
    setShowLocationTimeoutModal(false);
    setLocationTimeoutId(null);
  };
  const [showLocationErrorModal, setShowLocationErrorModal] = useState(false);

  const {
    location,
    headingAnim,
    destination,
    routeCoords,
    currentHeading,
    setDestination,
    getRoute,
    getHybridRouteFromCurrentLocation,
    directLineCoords,
    nearestRoadPoint,
    hasDirectLineSegment,
    routeService,
    clearRoute,
    clearRouteKeepDestination,
    routeDirection,
    error: locationError,
  } = useLocationAndNavigation();

  const [isUserLocationStale, setIsUserLocationStale] = useState(true);

  useEffect(() => {
    if (routeService && routeService.lastRawRouteData) {
      const navData = routeService.getNavigationData();
      if (navData) {
        setNavigationData(navData);
      }
    }
  }, [routeService?.lastRawRouteData]);

  useEffect(() => {
    if (!location && !showLocationTimeoutModal && !locationTimeoutId) {
      const timeout = setTimeout(() => {
        if (!location) {
          setShowLocationTimeoutModal(true);
        }
      }, 10000);
      setLocationTimeoutId(timeout);
    }
    if (location && locationTimeoutId) {
      clearTimeout(locationTimeoutId);
      setLocationTimeoutId(null);
    }
    if (location === null && locationError) {
      setShowLocationErrorModal(true);
    } else {
      setShowLocationErrorModal(false);
    }
    if (
      location &&
      typeof location.accuracy === "number" &&
      location.accuracy < 1000
    ) {
      setIsUserLocationStale(false);
    } else if (!location) {
      setIsUserLocationStale(true);
    }
  }, [location, locationError, showLocationTimeoutModal, locationTimeoutId]);

  useEffect(() => {
    if (location === null && locationError) {
      setShowLocationErrorModal(true);
    } else {
      setShowLocationErrorModal(false);
    }
  }, [location, locationError]);

  useEffect(() => {
    SafetyTestConfig.logConfiguration();
  }, []);

  const [search, setSearch] = useState("");
  const [showRouteDrawer, setShowRouteDrawer] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<any>(null);

  const [showPOIDrawer, setShowPOIDrawer] = useState(false);
  const [selectedAmenityType, setSelectedAmenityType] = useState<string>("");
  const [poiRadius, setPOIRadius] = useState(1000);
  const [selectedPOI, setSelectedPOI] = useState<OverpassPOI | null>(null);
  const [allPOIs, setAllPOIs] = useState<OverpassPOI[]>([]);

  const [wasFollowingBeforeRoute, setWasFollowingBeforeRoute] = useState(false);
  const [showMultiStepDrawer, setShowMultiStepDrawer] = useState(false);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [multiStepRouteCoords, setMultiStepRouteCoords] = useState<any[]>([]);

  const [cachedNavigationData, setCachedNavigationData] = useState<{
    routeData: any | null;
    navigationSteps: any[] | null;
    cacheKey: string | null;
  }>({
    routeData: null,
    navigationSteps: null,
    cacheKey: null,
  });
  const [importedRouteCoords, setImportedRouteCoords] = useState<
    { latitude: number; longitude: number; elevation?: number }[]
  >([]);
  const [showGpxDrawer, setShowGpxDrawer] = useState(false);
  const [gpxStartArrivalVisible, setGpxStartArrivalVisible] = useState(false);
  const [gpxStartPoint, setGpxStartPoint] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [gpxMinimizeSignal, setGpxMinimizeSignal] = useState(0);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [gpxImporting, setGpxImporting] = useState(false);
  const [gpxImportProgress, setGpxImportProgress] = useState(0);

  const GPX_DRAWER_HEIGHT = 350;

  const handleClearGpxOverlays = () => {
    setCompletedRouteCoords([]);
    setRemainingRouteCoords([]);
    setGpxStartPoint(null);
    setGpxStartArrivalVisible(false);
    setNavigationSteps([]);
    setImportedRouteCoords([]);
    setGpxImporting(false);
    setGpxImportProgress(0);
  };

  const handleStartFollowingGpx = () => {
    if (importedRouteCoords && importedRouteCoords.length > 1) {
      const gpxSteps =
        NavigationService.convertGpxTrackToNavigationSteps(importedRouteCoords);
      NavigationService.startNavigation(gpxSteps, routeService, "gpx");
      setNavigationSteps(gpxSteps);
      setCurrentStepIndex(0);
      setIsNavigating(true);
      setShowNavigationGuidance(true);
      startDrivingNavigation();
    }
  };

  const [isNavigating, setIsNavigating] = useState(false);

  const [navigationSteps, setNavigationSteps] = useState<any[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);

  const offRouteRecalcRunningRef = useRef(false);
  const [showNavigationGuidance, setShowNavigationGuidance] = useState(false);
  const [pendingRouteRequest, setPendingRouteRequest] = useState<{
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    mode: string;
  } | null>(null);
  const [navigationData, setNavigationData] = useState<NavigationData | null>(
    null
  );
  const [freshRouteData, setFreshRouteData] = useState<any>(null);

  const [completedRouteCoords, setCompletedRouteCoords] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [remainingRouteCoords, setRemainingRouteCoords] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [progressPercentage, setProgressPercentage] = useState(0);

  const [showParkingDrawer, setShowParkingDrawer] = useState(false);
  const [parkingLocation, setParkingLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [lastTrip, setLastTrip] = useState<LastTripData | null>(null);

  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showRestReminder, setShowRestReminder] = useState(false);
  const [safetyChoice, setSafetyChoice] = useState<
    "remind" | "rest-stops" | "ignore" | null
  >(null);
  const [restReminderTimer, setRestReminderTimer] =
    useState<NodeJS.Timeout | null>(null);
  const [navigationStartTime, setNavigationStartTime] = useState<Date | null>(
    null
  );
  const [longTripDuration, setLongTripDuration] = useState<number>(0);

  const [customPOILocation, setCustomPOILocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isFutureLocationSearch, setIsFutureLocationSearch] = useState(false);

  const [showLocationInfoDrawer, setShowLocationInfoDrawer] = useState(false);
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] =
    useState<number>(0);
  const [selectedLocationCoordinate, setSelectedLocationCoordinate] =
    useState<Coordinate | null>(null);
  const [showLocationPoint, setShowLocationPoint] = useState(false);

  const [showNavigationStepDrawer, setShowNavigationStepDrawer] =
    useState(false);
  const [selectedNavigationStep, setSelectedNavigationStep] =
    useState<any>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  const [showArrivalDrawer, setShowArrivalDrawer] = useState(false);
  const [hasReachedDestination, setHasReachedDestination] = useState(false);
  const [
    suppressArrivalDrawerOnNextArrival,
    setSuppressArrivalDrawerOnNextArrival,
  ] = useState(false);

  const [selectedParking, setSelectedParking] = useState<{
    coordinate: Coordinate;
    name: string;
  } | null>(null);

  const [isParkingAnimating, setIsParkingAnimating] = useState(false);

  const [showNavigationSearch, setShowNavigationSearch] = useState(false);

  const canShowGpxImport =
    !showRouteDrawer &&
    !showMultiStepDrawer &&
    !showLocationInfoDrawer &&
    !showNavigationStepDrawer &&
    !showArrivalDrawer &&
    !showParkingDrawer &&
    !showPOIDrawer &&
    !showNavigationGuidance &&
    !showFavorites &&
    !showSafetyModal &&
    !showRestReminder;
  const handleImportGpx = async () => {
    try {
      setGpxImporting(true);
      setGpxImportProgress(0);

      const res = await DocumentPicker.getDocumentAsync({ type: "*/*" });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        if (
          asset.uri &&
          asset.name &&
          asset.name.toLowerCase().endsWith(".gpx")
        ) {
          setGpxImportProgress(10);
          const resp = await fetch(asset.uri);
          setGpxImportProgress(30);
          const text = await resp.text();
          setGpxImportProgress(60);
          const parsed = parseGPX(text);
          setGpxImportProgress(80);
          const first =
            parsed.waypoints.length > 0 ? parsed.waypoints[0] : parsed.track[0];
          const gpxTrack =
            parsed.track && parsed.track.length > 0 ? parsed.track : [];
          if (first && gpxTrack.length > 1) {
            setImportedRouteCoords(
              gpxTrack.map((p) => ({
                latitude: p.latitude,
                longitude: p.longitude,
                elevation: (p as any).elevation,
              }))
            );
            setGpxStartPoint({
              latitude: first.latitude,
              longitude: first.longitude,
            });
            setShowGpxDrawer(true);
            setGpxImportProgress(100);
          }
        }
      }
    } catch (e) {
      setIsRecalculatingRoute(false);
    } finally {
      setTimeout(() => {
        setGpxImporting(false);
        setGpxImportProgress(0);
      }, 350);
    }
  };
  useEffect(() => {
    (async () => {
      const trip = await LastTripStorage.load();
      if (
        trip &&
        trip.destination &&
        trip.mode &&
        trip.routeSteps?.length > 0
      ) {
        setLastTrip(trip);
        setResumeModalVisible(true);
      }
    })();
  }, []);
  const handleResumeTrip = async (mode: string) => {
    if (!lastTrip) return;
    setResumeModalVisible(false);
    await NavigationService.startNavigation(
      lastTrip.routeSteps,
      undefined,
      mode,
      lastTrip.fullRouteCoordinates,
      lastTrip.destination
    );
    setIsNavigating(true);
    await LastTripStorage.clear();
    setLastTrip(null);
  };

  const handleCancelResumeTrip = async () => {
    setResumeModalVisible(false);
    await LastTripStorage.clear();
    setLastTrip(null);
  };

  const generateRouteCacheKey = (
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number },
    mode: string,
    waypoints?: Array<{ latitude: number; longitude: number }>
  ): string => {
    const startKey = `${start.latitude.toFixed(6)},${start.longitude.toFixed(
      6
    )}`;
    const endKey = `${end.latitude.toFixed(6)},${end.longitude.toFixed(6)}`;
    const waypointsKey = waypoints
      ? waypoints
          .map((wp) => `${wp.latitude.toFixed(6)},${wp.longitude.toFixed(6)}`)
          .join(";")
      : "";
    return `${startKey}-${endKey}-${mode}-${waypointsKey}`;
  };

  const extractTotalDuration = (routeData: any): number => {
    try {
      if (routeData.routes && routeData.routes[0]) {
        return routeData.routes[0].duration || 0;
      }
      if (routeData.features && routeData.features[0]) {
        return routeData.features[0].properties?.summary?.duration || 0;
      }
      if (routeData.trip && routeData.trip.summary) {
        return routeData.trip.summary.time || 0;
      }
    } catch (e) {}
    return 0;
  };

  const extractTotalDistance = (routeData: any): number => {
    try {
      if (routeData.routes && routeData.routes[0]) {
        return routeData.routes[0].distance || 0;
      }
      if (routeData.features && routeData.features[0]) {
        return routeData.features[0].properties?.summary?.distance || 0;
      }
      if (routeData.trip && routeData.trip.summary) {
        return routeData.trip.summary.length || 0;
      }
    } catch (e) {}
    return 0;
  };

  const cacheNavigationData = (
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number },
    mode: string,
    routeData: any,
    navigationSteps: any[],
    waypoints?: Array<{ latitude: number; longitude: number }>
  ) => {
    const cacheKey = generateRouteCacheKey(start, end, mode, waypoints);
    setCachedNavigationData({
      routeData,
      navigationSteps,
      cacheKey,
    });

    if (routeService && routeData) {
      (routeService as any).lastRawRouteData = routeData;

      const navData = routeService.getNavigationData();
      if (navData) {
        setNavigationData(navData);
      }
    }
  };

  const getCachedNavigationData = (
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number },
    mode: string,
    waypoints?: Array<{ latitude: number; longitude: number }>
  ) => {
    const cacheKey = generateRouteCacheKey(start, end, mode, waypoints);
    if (cachedNavigationData.cacheKey === cacheKey) {
      return cachedNavigationData;
    }
    return null;
  };

  const clearNavigationCache = () => {
    setCachedNavigationData({
      routeData: null,
      navigationSteps: null,
      cacheKey: null,
    });
  };

  const checkTripSafety = (durationInMinutes: number) => {
    if (durationInMinutes > SafetyTestConfig.LONG_TRIP_THRESHOLD_MINUTES) {
      setLongTripDuration(durationInMinutes);
      setShowSafetyModal(true);
      return true;
    }
    return false;
  };

  const handleSafetyChoice = (choice: "remind" | "rest-stops" | "ignore") => {
    setSafetyChoice(choice);
    setShowSafetyModal(false);

    switch (choice) {
      case "remind":
        const reminderTimer = setTimeout(() => {
          setShowRestReminder(true);
        }, SafetyTestConfig.getReminderDelayMs());
        setRestReminderTimer(reminderTimer);
        setNavigationStartTime(new Date());
        break;

      case "rest-stops":
        handleFindRestStops();
        break;

      case "ignore":
        break;
    }

    startNavigationAfterSafetyChoice();
  };

  const startNavigationAfterSafetyChoice = () => {
    if (navigationSteps.length > 0) {
      const transportMode = navigationMode || "driving";
      let osrmMode = "driving";

      if (transportMode === "walking") {
        osrmMode = "foot";
        startWalkingNavigation();
      } else {
        osrmMode = "driving";
        startDrivingNavigation();
      }

      NavigationService.startNavigation(
        navigationSteps,
        routeService,
        osrmMode
      );
      setIsNavigating(true);
      setShowMultiStepDrawer(false);
      setShowRouteDrawer(false);
    }
  };

  const calculateFuturePosition = (
    hoursAhead: number
  ): { latitude: number; longitude: number } | null => {
    if (
      !location ||
      !routeCoords ||
      routeCoords.length === 0 ||
      !isNavigating
    ) {
      return null;
    }

    const averageSpeeds = {
      driving: 50,
      walking: 5,
      cycling: 15,
    };

    const currentSpeed =
      averageSpeeds[navigationMode as keyof typeof averageSpeeds] ||
      averageSpeeds.driving;

    const targetDistanceMeters = hoursAhead * currentSpeed * 1000;

    const getDistance = (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number
    ): number => {
      const R = 6371e3;
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    };

    let accumulatedDistance = 0;
    let currentLat = location.latitude;
    let currentLon = location.longitude;

    let closestPointIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routeCoords.length; i++) {
      const distance = getDistance(
        currentLat,
        currentLon,
        routeCoords[i].latitude,
        routeCoords[i].longitude
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestPointIndex = i;
      }
    }

    for (let i = closestPointIndex; i < routeCoords.length - 1; i++) {
      const pointA = routeCoords[i];
      const pointB = routeCoords[i + 1];

      const segmentDistance = getDistance(
        pointA.latitude,
        pointA.longitude,
        pointB.latitude,
        pointB.longitude
      );

      if (accumulatedDistance + segmentDistance >= targetDistanceMeters) {
        const remainingDistance = targetDistanceMeters - accumulatedDistance;
        const ratio = remainingDistance / segmentDistance;

        const futurePosition = {
          latitude:
            pointA.latitude + (pointB.latitude - pointA.latitude) * ratio,
          longitude:
            pointA.longitude + (pointB.longitude - pointA.longitude) * ratio,
        };

        return futurePosition;
      }

      accumulatedDistance += segmentDistance;
    }

    const finalPosition = routeCoords[routeCoords.length - 1];
    return finalPosition;
  };

  const handleFindRestStops = async () => {
    if (!location) return;

    try {
      const twoHoursFromNow = calculateFuturePosition(
        SafetyTestConfig.IS_TEST_MODE ? 0.17 : 2
      );

      if (!twoHoursFromNow) {
        setCustomPOILocation(null);
        setIsFutureLocationSearch(false);
        handleShowPOI("fuel");
        return;
      }

      setCustomPOILocation(twoHoursFromNow);
      setIsFutureLocationSearch(true);

      handleShowPOI("fuel");
    } catch (error) {
      setCustomPOILocation(null);
      setIsFutureLocationSearch(false);
      handleShowPOI("fuel");
    }
  };

  const handleRestReminderAction = (
    action: "rest" | "find-stop" | "ignore"
  ) => {
    setShowRestReminder(false);

    switch (action) {
      case "rest":
        handleFindRestStops();
        break;

      case "find-stop":
        handleFindRestStops();
        break;

      case "ignore":
        const newReminderTimer = setTimeout(() => {
          setShowRestReminder(true);
        }, SafetyTestConfig.getRepeatedReminderDelayMs());
        setRestReminderTimer(newReminderTimer);
        break;
    }
  };

  const cleanupSafetyTimers = () => {
    if (restReminderTimer) {
      clearTimeout(restReminderTimer);
      setRestReminderTimer(null);
    }
    setSafetyChoice(null);
    setNavigationStartTime(null);
    setLongTripDuration(0);
  };

  const getAdjustedCoordinate = (
    coordinate: Coordinate,
    zoomLevel?: number,
    pitch?: number,
    drawerHeight: number = 0,
    marginPx: number = 80
  ) => {
    const screenHeight = Dimensions.get("window").height;

    if (!drawerHeight || drawerHeight <= 0) {
      return {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        pitch: pitch || 0,
      };
    }

    const DEFAULT_MARGIN_PX = marginPx;
    const margin = DEFAULT_MARGIN_PX;

    let desiredY = screenHeight - drawerHeight - margin;
    const minY = 40;
    const maxY = screenHeight - drawerHeight - 10;
    if (desiredY < minY) desiredY = minY;
    if (desiredY > maxY) desiredY = maxY;

    const screenCenterY = screenHeight / 2;
    const pixelOffset = desiredY - screenCenterY;

    const usedZoom = zoomLevel || 13;
    const latRad = (coordinate.latitude * Math.PI) / 180;
    const metersPerPixel =
      (156543.03392 * Math.cos(latRad)) / Math.pow(2, usedZoom);

    const metersPerDegreeLat = 111320;
    const offsetMeters = pixelOffset * metersPerPixel;
    const offsetLat = offsetMeters / metersPerDegreeLat;

    const DAMPING = 0.01;
    const MAX_OFFSET_DEG = 0.001;
    const raw = offsetLat * DAMPING;
    const clamped = Math.sign(raw) * Math.min(Math.abs(raw), MAX_OFFSET_DEG);

    return {
      latitude: coordinate.latitude + clamped,
      longitude: coordinate.longitude,
      pitch: pitch || 0,
    };
  };

  const {
    recenterMap,
    animateToCoordinate,
    animateToCoordinateLocked,
    fitToRoute,
    compassMode,
    toggleCompassMode,
    updateMapHeading,
    isFollowingUser,
    followUserLocation,
    handleMapPanDrag,
    disableFollowModeTemporarily,
    reactivateFollowMode,
    setDrawerPadding,
    drawerPadding,
    clearDrawerPadding,
    setDrawerCameraControl,
    releaseDrawerCameraControl,
    isNavigating: isMapNavigating,
    navigationMode,
    startWalkingNavigation,
    startDrivingNavigation,
    startNavigationForMode,
    stopNavigation,
    adjustNavigationCamera,
    calculateDistance,
    showRecenterPrompt,
    manualRecenter,
  } = useMapControls();

  const [cameraHeadingOverride, setCameraHeadingOverride] = useState<
    number | null
  >(null);

  const lastSentHeadingRef = React.useRef<number | null>(null);
  const lastSentHeadingTimeRef = React.useRef<number>(0);

  useEffect(() => {
    if (isNavigating && !isMapNavigating) {
      if (navigationMode === "walking") {
        startWalkingNavigation();
      } else {
        startDrivingNavigation();
      }
    }
  }, [isNavigating, isMapNavigating]);

  useEffect(() => {
    if (isMapNavigating) {
      const headingToUse =
        routeDirection && routeDirection.isOnRoute
          ? routeDirection.bearing
          : currentHeading;

      if (headingToUse !== undefined && headingToUse !== null) {
        const normalize = (a: number) => ((a % 360) + 360) % 360;
        const now = Date.now();
        const last = lastSentHeadingRef.current;
        const lastTime = lastSentHeadingTimeRef.current;
        const h = normalize(headingToUse);

        let shouldUpdate = true;
        if (last !== null) {
          let diff = Math.abs(h - last);
          if (diff > 180) diff = 360 - diff;
          if (diff < 2 && now - lastTime < 500) {
            shouldUpdate = false;
          }
        }

        if (shouldUpdate) {
          lastSentHeadingRef.current = h;
          lastSentHeadingTimeRef.current = now;
          setCameraHeadingOverride(h);
        }
      }
      return;
    }

    setCameraHeadingOverride(null);

    if (currentHeading !== undefined && compassMode === "heading") {
      updateMapHeading(currentHeading);
    }
  }, [
    currentHeading,
    compassMode,
    updateMapHeading,
    isMapNavigating,
    routeDirection,
  ]);

  useEffect(() => {
    if (
      location &&
      isFollowingUser &&
      !selectedParking &&
      !showLocationInfoDrawer &&
      !showParkingDrawer &&
      !isParkingAnimating
    ) {
      const delayBeforeFollow = selectedParking ? 2000 : 0;
      
      setTimeout(() => {
        if (isFollowingUser && !selectedParking && !isParkingAnimating) {
          followUserLocation(location);
        } else {
        }
      }, delayBeforeFollow);
    } else {
      if (location && isFollowingUser) {
      }
    }
  }, [
    location,
    isFollowingUser,
    selectedParking,
    showLocationInfoDrawer,
    showParkingDrawer,
    isParkingAnimating,
  ]);

  useEffect(() => {
    if (location && isMapNavigating && !isParkingAnimating) {
      const currentNavState = NavigationService.getCurrentState();

      const computeBearingTo = (
        from: { latitude: number; longitude: number },
        to: { latitude: number; longitude: number }
      ) => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const toDeg = (d: number) => (d * 180) / Math.PI;
        const lat1 = toRad(from.latitude);
        const lat2 = toRad(to.latitude);
        const dLon = toRad(to.longitude - from.longitude);
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x =
          Math.cos(lat1) * Math.sin(lat2) -
          Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
        return brng;
      };

      if (currentNavState.nextStep && currentNavState.isNavigating) {
        const nextStepLocation = {
          latitude: currentNavState.nextStep.coordinates[1], 
          longitude: currentNavState.nextStep.coordinates[0],
        };

        let headingOverride: number | undefined;
        if (routeDirection && routeDirection.isOnRoute) {
          headingOverride = routeDirection.bearing;
        } else {
          headingOverride = computeBearingTo(location, nextStepLocation);
        }

        adjustNavigationCamera(
          location,
          nextStepLocation,
          currentNavState.distanceToNextStep,
          headingOverride
        );
      } else if (destination) {
        const headingOverride =
          routeDirection && routeDirection.isOnRoute
            ? routeDirection.bearing
            : computeBearingTo(location, destination);

        adjustNavigationCamera(
          location,
          destination,
          undefined,
          headingOverride
        );
      }
    }
  }, [
    location,
    isMapNavigating,
    adjustNavigationCamera,
    isParkingAnimating,
    routeDirection,
    destination,
  ]);

  useEffect(() => {
    const handleNavigationUpdate = (navigationState: any) => {
      setNavigationSteps(navigationState.steps);
      setCurrentStepIndex(navigationState.currentStepIndex);

      if (navigationState.isNavigating && !isMapNavigating) {
        if (navigationMode === "walking") {
          startWalkingNavigation();
        } else {
          startDrivingNavigation();
        }
      }

      if (navigationState.completedRouteCoordinates) {
        setCompletedRouteCoords(
          navigationState.completedRouteCoordinates.map(
            (coord: [number, number]) => ({
              latitude: coord[1],
              longitude: coord[0],
            })
          )
        );
      }

      if (navigationState.remainingRouteCoordinates) {
        setRemainingRouteCoords(
          navigationState.remainingRouteCoordinates.map(
            (coord: [number, number]) => ({
              latitude: coord[1],
              longitude: coord[0],
            })
          )
        );
      }

      if (navigationState.progressPercentage !== undefined) {
        setProgressPercentage(navigationState.progressPercentage);
      }

      try {
        if (navigationState.isOffRoute) {
          if (navigationState.isRecalculating) {
            setIsRecalculatingRoute(true);
            return;
          }

          if (!isRecalculatingRoute && !offRouteRecalcRunningRef.current) {
            offRouteRecalcRunningRef.current = true;
            (async () => {
              try {
                setIsRecalculatingRoute(true);

                const loc = navigationState.currentLocation || location;
                let startPoint: any = loc;
                try {
                  if (
                    routeService &&
                    typeof routeService.recalculateIfOffRoute === "function"
                  ) {
                    const res = await routeService.recalculateIfOffRoute(
                      loc,
                      "driving"
                    );
                    if (res) startPoint = res;
                  }
                } catch (e) {}

                const dest = routeService?.destination || null;
                if (!startPoint || !dest || !routeService) {
                  setIsRecalculatingRoute(false);
                  return;
                }

                const ok = await routeService.getHybridRoute(
                  startPoint,
                  dest,
                  "driving"
                );
                if (ok) {
                  const fetched = (routeService as any).lastRawRouteData;
                  try {
                    const newSteps =
                      NavigationService.convertRouteToNavigationSteps(fetched);
                    const flat = Array.isArray(routeService.routeCoords)
                      ? (routeService.routeCoords as any[])
                          .map((c: any) => [c.longitude, c.latitude])
                          .flat()
                      : undefined;
                    await NavigationService.startNavigation(
                      newSteps,
                      routeService,
                      "driving",
                      flat,
                      dest
                    );

                    setFreshRouteData(fetched);

                    const navData = routeService.getNavigationData();
                    if (navData) {
                      setNavigationData(navData);
                    }

                    const start: Coordinate = {
                      latitude: startPoint.latitude,
                      longitude: startPoint.longitude,
                    };
                    const navigationSteps =
                      NavigationService.convertRouteToNavigationSteps(fetched);
                    cacheNavigationData(
                      start,
                      dest,
                      "driving",
                      fetched,
                      navigationSteps
                    );

                    setPendingRouteRequest(null);
                    setShowNavigationGuidance(true);
                  } catch (e) {}
                } else {
                }
              } catch (err) {
              } finally {
                setIsRecalculatingRoute(false);
                offRouteRecalcRunningRef.current = false;
              }
            })();
          }
        } else {
          if (isRecalculatingRoute) {
            setIsRecalculatingRoute(false);
            offRouteRecalcRunningRef.current = false;
            try {
              if (
                NavigationService &&
                typeof (NavigationService as any).stopRecalculation ===
                  "function"
              ) {
                (NavigationService as any).stopRecalculation();
              }
            } catch (e) {}
          }
        }

        if (!navigationState.isOffRoute && isRecalculatingRoute) {
          setIsRecalculatingRoute(false);
          offRouteRecalcRunningRef.current = false;
        } else if (
          navigationState.isRecalculating &&
          !isRecalculatingRoute &&
          navigationState.isOffRoute
        ) {
          setIsRecalculatingRoute(true);
        } else if (
          !navigationState.isRecalculating &&
          isRecalculatingRoute &&
          !offRouteRecalcRunningRef.current
        ) {
          setIsRecalculatingRoute(false);
        }
      } catch (e) {}
    };

    NavigationService.addListener(handleNavigationUpdate);

    return () => {
      NavigationService.removeListener(handleNavigationUpdate);
    };
  }, []);

  useEffect(() => {
    if (showRouteDrawer) {
      setDrawerPadding(180);
      setDrawerCameraControl("route-drawer");
    } else if (showMultiStepDrawer) {
      setDrawerPadding(350);
      setDrawerCameraControl("multistep-drawer");
    } else if (showLocationInfoDrawer) {
      setDrawerPadding(200);
      setDrawerCameraControl("location-info-drawer");
    } else if (showNavigationStepDrawer) {
      setDrawerPadding(250);
      setDrawerCameraControl("navigation-step-drawer");
    } else if (showArrivalDrawer) {
      setDrawerPadding(400);
      setDrawerCameraControl("arrival-drawer");
    } else if (showParkingDrawer) {
      setDrawerPadding(350);
    } else if (showPOIDrawer) {
      setDrawerPadding(400);
      setDrawerCameraControl("poi-drawer");
    } else {
      clearDrawerPadding();
      releaseDrawerCameraControl();
    }
  }, [
    showRouteDrawer,
    showMultiStepDrawer,
    showLocationInfoDrawer,
    showNavigationStepDrawer,
    showArrivalDrawer,
    showParkingDrawer,
    showPOIDrawer,
  ]);

  useEffect(() => {
    if (isNavigating && location && destination && !hasReachedDestination) {
      const distance = getDistanceBetweenPoints(
        location.latitude,
        location.longitude,
        destination.latitude,
        destination.longitude
      );

      const arrivalThreshold = 20;

      if (distance <= arrivalThreshold) {
        handleArrivalAtDestination();
      }
    }
  }, [location, destination, isNavigating, hasReachedDestination]);

  useEffect(() => {
    if (!location || !gpxStartPoint) return;
    const dist = getDistanceBetweenPoints(
      location.latitude,
      location.longitude,
      gpxStartPoint.latitude,
      gpxStartPoint.longitude
    );
    const threshold = 30;
    if (dist <= threshold) {
      setGpxStartArrivalVisible(true);
    }
  }, [
    location?.latitude,
    location?.longitude,
    gpxStartPoint?.latitude,
    gpxStartPoint?.longitude,
  ]);

  const getDistanceBetweenPoints = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const handleSelectLocation = async (result: any) => {
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    setHasReachedDestination(false);
    setShowArrivalDrawer(false);

    const coord = {
      latitude: result.latitude,
      longitude: result.longitude,
    };

    setDestination(coord);

    if (location) {
      await getHybridRouteFromCurrentLocation(coord, "driving");

      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        coord,
        routeCoords,
        true
      );
    } else {
      const adjustedCoord = getAdjustedCoordinate(
        coord,
        undefined,
        undefined,
        0
      );
      animateToCoordinate(adjustedCoord);
    }

    setShowRouteDrawer(true);
    setSelectedDestination({
      title: result.title || result.display_name || "",
      subtitle: result.subtitle || "",
      latitude: result.latitude,
      longitude: result.longitude,
    });
  };

  const handleShowRoute = (result: any) => {
    setSelectedDestination({
      title: result.title,
      subtitle: result.subtitle,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    const coord = { latitude: result.latitude, longitude: result.longitude };
    const adjusted = getAdjustedCoordinate(coord, undefined, undefined, 180);
    animateToCoordinate(adjusted, 15);
    setShowRouteDrawer(true);
  };

  const handleMapPress = (coordinate: Coordinate) => {
    disableFollowModeTemporarily();

    const screenHeight = Dimensions.get("window").height;
    const latitudeDelta = 0.01;
    const offsetLat = (drawerPadding / screenHeight) * latitudeDelta;

    const adjustedCoordinate = {
      latitude: coordinate.latitude + offsetLat,
      longitude: coordinate.longitude,
    };

    animateToCoordinate(adjustedCoordinate, 17);

    setSelectedLocationCoordinate(coordinate);
    setShowLocationInfoDrawer(true);
  };

  const handleStartRouteFromLocation = (coordinate: Coordinate) => {
    setShowLocationInfoDrawer(false);

    setHasReachedDestination(false);
    setShowArrivalDrawer(false);

    if (!isNavigating) {
      const wasFollowing = disableFollowModeTemporarily();
      setWasFollowingBeforeRoute(wasFollowing);

      setSelectedDestination({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });
      setShowRouteDrawer(true);
    } else {
      handleStopNavigation();

      setTimeout(() => {
        const wasFollowing = disableFollowModeTemporarily();
        setWasFollowingBeforeRoute(wasFollowing);

        setSelectedDestination({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        });
        setShowRouteDrawer(true);
      }, 100);
    }
  };

  const handleNavigationStepPress = (stepIndex: number, step: any) => {
    setSelectedStepIndex(stepIndex);
    setSelectedNavigationStep(step);
    setShowNavigationStepDrawer(true);

    if (step && step.coordinates) {
      const coord = {
        latitude: step.coordinates[1],  
        longitude: step.coordinates[0], 
      };
      const adjustedCoord = getAdjustedCoordinate(coord, 17, undefined, 250); 
      animateToCoordinate(adjustedCoord, 17);
    }
  };

  const handleCloseNavigationStepDrawer = () => {
    setShowNavigationStepDrawer(false);
    setSelectedNavigationStep(null);

    if (isNavigating && location) {
      animateToCoordinate(
        {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        16
      );
    }
  };

  const handleArrivalAtDestination = async () => {
    if (destination && location) {
      const isIntermediateStop = selectedDestination?.finalDestination;

      if (isIntermediateStop) {
        try {
          setIsRecalculatingRoute(true);

          const finalDestination = selectedDestination?.finalDestination;
          if (finalDestination) {
            await getHybridRouteFromCurrentLocation(
              finalDestination,
              "driving"
            );

            const routingResult = await fetchParallelRouting(
              { latitude: location.latitude, longitude: location.longitude },
              finalDestination,
              "driving",
              { alternatives: true }
            );

            if (
              routingResult.success &&
              routingResult.data?.routes?.length > 0
            ) {
              const navigationSteps =
                NavigationService.convertRouteToNavigationSteps(
                  routingResult.data
                );

              cacheNavigationData(
                { latitude: location.latitude, longitude: location.longitude },
                finalDestination,
                "driving",
                routingResult.data,
                navigationSteps
              );

              NavigationService.startNavigation(
                navigationSteps,
                routeService,
                navigationMode || "driving"
              );

              setNavigationSteps(navigationSteps);
              setCurrentStepIndex(0);
              setDestination(finalDestination);

              setSelectedDestination({
                title: "Destination finale",
                subtitle: "",
                latitude: finalDestination.latitude,
                longitude: finalDestination.longitude,
              });
            }
          }
        } catch (error) {
          setIsNavigating(false);
          setHasReachedDestination(true);
          if (suppressArrivalDrawerOnNextArrival) {
            setSuppressArrivalDrawerOnNextArrival(false);
          } else {
            setShowArrivalDrawer(true);
          }
        } finally {
          setIsRecalculatingRoute(false);
        }
      } else {
        setHasReachedDestination(true);
        if (suppressArrivalDrawerOnNextArrival) {
          setSuppressArrivalDrawerOnNextArrival(false);
          setIsNavigating(false);
        } else {
          setShowArrivalDrawer(true);
          setIsNavigating(false);
        }

        const midLat = (destination.latitude + location.latitude) / 2;
        const midLng = (destination.longitude + location.longitude) / 2;

        const midCoord = {
          latitude: midLat,
          longitude: midLng,
        };
        const adjustedCoord = getAdjustedCoordinate(
          midCoord,
          15,
          undefined,
          400
        );

        animateToCoordinate(adjustedCoord, 15);
      }
    }
  };

  const handleCloseArrivalDrawer = () => {
    setShowArrivalDrawer(false);
    clearDrawerPadding();
  };

  const handleDisableFollowUserForArrival = () => {
    disableFollowModeTemporarily();
  };

  const handleEnableFollowUserForArrival = () => {
    reactivateFollowMode();
  };

  const handleAdjustCameraForArrival = (coordinate: Coordinate) => {
    if (location) {
      const centerLat = (location.latitude + coordinate.latitude) / 2;
      const centerLng = (location.longitude + coordinate.longitude) / 2;

      const centerCoord = {
        latitude: centerLat,
        longitude: centerLng,
      };
      const adjustedCoord = getAdjustedCoordinate(
        centerCoord,
        16,
        undefined,
        400
      );

      animateToCoordinate(adjustedCoord, 16);
    }
  };

  const handleNavigateAgain = () => {
    setShowArrivalDrawer(false);
    setHasReachedDestination(false);
    if (destination) {
      if (navigationMode === "driving") {
        startDrivingNavigation();
      } else {
        startWalkingNavigation();
      }
      setIsNavigating(true);
    }
  };

  const handleShowLocationPoint = (show: boolean) => {
    setShowLocationPoint(show);

    if (!show && !selectedParking && !isParkingAnimating) {
      reactivateFollowMode();
    }
  };

  const handleAddStep = (result: any) => {
    const newStep: RouteStep = {
      id: Date.now().toString(),
      title: result.title,
      subtitle: result.subtitle,
      latitude: result.latitude,
      longitude: result.longitude,
      type: result.type === "overpass" ? "poi" : "address",
      amenityType: result.amenityType,
    };

    setRouteSteps((prev) => [...prev, newStep]);
    setShowMultiStepDrawer(true);
  };

  const handleRemoveStep = (stepId: string) => {
    setRouteSteps((prev) => prev.filter((step) => step.id !== stepId));
  };

  const handleReorderSteps = (newSteps: RouteStep[]) => {
    setRouteSteps(newSteps);
  };

  const handleAddNavigationStop = async (result: any) => {
    if (!location) {
      return;
    }

    try {
      const stopCoordinate = {
        latitude: result.latitude,
        longitude: result.longitude,
      };

      Alert.alert(
        "Ajouter un arrêt",
        `Voulez-vous faire un arrêt à "${result.title}" ?`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Ajouter l'arrêt",
            onPress: async () => {
              try {
                setIsRecalculatingRoute(true);

                const finalDestination = destination;
                if (!finalDestination) {
                  throw new Error("Aucune destination finale trouvée");
                }

                const waypoints = [stopCoordinate];

                const routingResult = await fetchParallelRouting(
                  {
                    latitude: location.latitude,
                    longitude: location.longitude,
                  },
                  finalDestination,
                  "driving",
                  {
                    alternatives: true,
                    waypoints: waypoints,
                  }
                );

                if (
                  routingResult.success &&
                  routingResult.data?.routes?.length > 0
                ) {
                  await getHybridRouteFromCurrentLocation(
                    stopCoordinate,
                    "driving"
                  );

                  const navigationSteps =
                    NavigationService.convertRouteToNavigationSteps(
                      routingResult.data
                    );

                  cacheNavigationData(
                    {
                      latitude: location.latitude,
                      longitude: location.longitude,
                    },
                    finalDestination,
                    "driving",
                    routingResult.data,
                    navigationSteps,
                    waypoints
                  );

                  NavigationService.startNavigation(
                    navigationSteps,
                    routeService,
                    navigationMode || "driving"
                  );

                  setNavigationSteps(navigationSteps);
                  setCurrentStepIndex(0);

                  setDestination(stopCoordinate);

                  setSelectedDestination({
                    title: result.title,
                    subtitle: result.subtitle,
                    latitude: result.latitude,
                    longitude: result.longitude,
                    finalDestination: finalDestination,
                  });

                  if (fitToRoute) {
                    setTimeout(() => {
                      fitToRoute(
                        {
                          latitude: location.latitude,
                          longitude: location.longitude,
                        },
                        stopCoordinate,
                        routeCoords,
                        false
                      );
                    }, 500);
                  }
                  Alert.alert(
                    "Arrêt ajouté avec succès",
                    `L'arrêt "${result.title}" a été ajouté à votre itinéraire. Vous continuerez ensuite vers votre destination finale.`
                  );
                } else {
                  throw new Error(
                    "Aucune route trouvée pour l'itinéraire avec arrêt"
                  );
                }
              } catch (error) {
                Alert.alert(
                  "Erreur",
                  "Impossible d'ajouter cet arrêt. Veuillez réessayer."
                );
              } finally {
                setIsRecalculatingRoute(false);
              }
            },
          },
        ]
      );
    } catch (error) {}
  };

  const handleSearchNearbyPOI = async (amenityType: string) => {
    if (!location) {
      return;
    }

    try {
      const searchRadius = 5000;
      const pois = await OverpassService.searchPOI(
        location.latitude,
        location.longitude,
        searchRadius,
        amenityType
      );

      if (pois.length > 0) {
        setSelectedAmenityType(amenityType);
        setAllPOIs(pois);
        setShowPOIDrawer(true);

        const firstPOI = pois[0];
        if (firstPOI) {
          const coord = {
            latitude: firstPOI.lat,
            longitude: firstPOI.lon,
          };

          setTimeout(() => {
            const adjustedCoord = getAdjustedCoordinate(
              coord,
              15,
              undefined,
              400
            );
            animateToCoordinate(adjustedCoord, 15);
          }, 300);
        }
      } else {
        Alert.alert(
          "Aucun résultat",
          `Aucun "${amenityType}" trouvé dans un rayon de ${
            searchRadius / 1000
          }km.`
        );
      }
    } catch (error) {
      Alert.alert(
        "Erreur",
        "Impossible de rechercher les points d'intérêt. Veuillez réessayer."
      );
    }
  };

  const handleCalculateMultiStepRoute = async (transportMode: string) => {
    if (!location || routeSteps.length === 0) return;

    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    let osrmMode = "driving";
    switch (transportMode) {
      case "driving":
        osrmMode = "driving";
        break;
      case "walking":
        osrmMode = "foot";
        break;
      case "bicycling":
        osrmMode = "driving";
        break;
      case "transit":
        osrmMode = "driving";
        break;
    }

    const coordinates = [
      [location.longitude, location.latitude],
      ...routeSteps.map((step) => [step.longitude, step.latitude]),
    ];

    try {
      let totalDist = 0;
      let totalDur = 0;
      const allRouteCoords: any[] = [];

      for (let i = 0; i < coordinates.length - 1; i++) {
        await getRoute(
          [coordinates[i][0], coordinates[i][1]] as [number, number],
          [coordinates[i + 1][0], coordinates[i + 1][1]] as [number, number],
          osrmMode
        );

        const lat1 = coordinates[i][1];
        const lon1 = coordinates[i][0];
        const lat2 = coordinates[i + 1][1];
        const lon2 = coordinates[i + 1][0];

        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a =
          Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        totalDist += distance;

        let speed = 50;
        switch (transportMode) {
          case "walking":
            speed = 5;
            break;
          case "bicycling":
            speed = 15;
            break;
          case "driving":
            speed = 50;
            break;
          case "transit":
            speed = 30;
            break;
        }

        totalDur += (distance / 1000 / speed) * 3600;
      }

      setTotalDistance(totalDist);
      setTotalDuration(totalDur);
    } catch (error) {}
  };

  const handleStartMultiStepNavigation = async () => {
    if (routeSteps.length > 0 && location && multiStepRouteCoords.length > 0) {
      try {
        const intermediateWaypoints = routeSteps.map((step) => ({
          latitude: step.latitude,
          longitude: step.longitude,
        }));

        const routingResult = await fetchParallelRouting(
          { latitude: location.latitude, longitude: location.longitude },
          intermediateWaypoints[intermediateWaypoints.length - 1],
          "driving",
          {
            alternatives: true,
            waypoints: intermediateWaypoints.slice(0, -1),
          }
        );

        if (routingResult.success && routingResult.data?.routes?.length > 0) {
          const navigationSteps =
            NavigationService.convertRouteToNavigationSteps(routingResult.data);

          cacheNavigationData(
            { latitude: location.latitude, longitude: location.longitude },
            intermediateWaypoints[intermediateWaypoints.length - 1],
            "driving",
            routingResult.data,
            navigationSteps,
            intermediateWaypoints.slice(0, -1)
          );

          const routeDurationMinutes = Math.round(
            routingResult.data.routes[0].duration / 60
          );

          const isLongTrip = checkTripSafety(routeDurationMinutes);

          if (isLongTrip) {
            setNavigationSteps(navigationSteps);
            return;
          }

          NavigationService.startNavigation(
            navigationSteps,
            routeService,
            "driving"
          );
          setIsNavigating(true);
        }
      } catch (error) {}

      setShowMultiStepDrawer(false);
    }
  };

  const handleCloseMultiStepDrawer = () => {
    setShowMultiStepDrawer(false);

    if (wasFollowingBeforeRoute && !selectedParking && !isParkingAnimating) {
      reactivateFollowMode();
      setWasFollowingBeforeRoute(false);
    }

    setMultiStepRouteCoords([]);
  };

  const handleShowPOI = (
    amenityType: string,
    preloadedPois?: OverpassPOI[]
  ) => {
    setSelectedAmenityType(amenityType);
    setShowPOIDrawer(true);

    if (preloadedPois && preloadedPois.length > 0) {
      setAllPOIs(preloadedPois);
    }
  };

  const handleClosePOIDrawer = () => {
    setShowPOIDrawer(false);
    setSelectedAmenityType("");
    setSelectedPOI(null);
    setAllPOIs([]);
    setCustomPOILocation(null);
    setIsFutureLocationSearch(false);
    setDestination(null);
  };

  const handleSelectPOI = (poi: OverpassPOI) => {
    setSelectedPOI(poi);

    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    setTimeout(() => {
      const coord = {
        latitude: poi.lat,
        longitude: poi.lon,
      };
      const drawerH = typeof drawerPadding === "number" ? drawerPadding : 400;
      const adjustedCoord = getAdjustedCoordinate(
        coord,
        16,
        undefined,
        drawerH
      );
      animateToCoordinateLocked(adjustedCoord, 16, adjustedCoord.pitch || 0);
    }, 350);
  };

  const handlePOIRoute = async (poi: OverpassPOI, transportMode: string) => {
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    setSelectedPOI(null);

    const destination = {
      title: poi.tags.name || poi.tags.amenity || "POI",
      subtitle: poi.tags.addr_street || "Adresse non disponible",
      latitude: poi.lat,
      longitude: poi.lon,
    };

    setSelectedDestination(destination);

    if (location) {
      const coord = {
        latitude: poi.lat,
        longitude: poi.lon,
      };
      setDestination(coord);

      let osrmMode = "driving";
      switch (transportMode) {
        case "driving":
          osrmMode = "driving";
          break;
        case "walking":
          osrmMode = "foot";
          break;
        case "bicycling":
          osrmMode = "driving";
          break;
        case "transit":
          osrmMode = "driving";
          break;
      }

      const poiDestination = {
        latitude: poi.lat,
        longitude: poi.lon,
      };
      await getHybridRouteFromCurrentLocation(poiDestination, osrmMode);

      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        coord,
        routeCoords,
        true
      );
    }

    setShowPOIDrawer(false);
    setShowRouteDrawer(true);
  };

  useEffect(() => {
    if (showRouteDrawer && selectedDestination) {
      const coord = {
        latitude: selectedDestination.latitude,
        longitude: selectedDestination.longitude,
      };
      const adjusted = getAdjustedCoordinate(coord, undefined, undefined, 180);
      animateToCoordinate(adjusted, 15);
    }
  }, [showRouteDrawer, selectedDestination]);

  const handlePOIRadiusChange = (radius: number) => {
    setPOIRadius(radius);
  };

  const handlePOIsFound = (pois: OverpassPOI[]) => {
    setAllPOIs(pois);
  };

  const handleStartNavigation = async (transportMode: string = "driving") => {
    if (!selectedDestination || !location) return;

    if (transportMode === "walking") startWalkingNavigation();
    else startDrivingNavigation();
    setIsNavigating(true);

    setShowRouteDrawer(false);
    setShowNavigationGuidance(true);

    if (freshRouteData) {
      const navData = {
        routeData: freshRouteData,
        totalDuration: extractTotalDuration(freshRouteData),
        totalDistance: extractTotalDistance(freshRouteData),
        steps: [],
      };

      setNavigationData(navData);
      setPendingRouteRequest(null);
      setIsRecalculatingRoute(false);

      return;
    }

    const hasMatchingRouteData =
      routeService &&
      routeService.lastRawRouteData &&
      routeService.destination &&
      routeService.destination.latitude === selectedDestination.latitude &&
      routeService.destination.longitude === selectedDestination.longitude;

    if (hasMatchingRouteData) {
      const navData = routeService.getNavigationData();
      if (navData) {
        setNavigationData(navData);
        setPendingRouteRequest(null);
        setIsRecalculatingRoute(false);
        return;
      }
    }

    const start = {
      latitude: location.latitude,
      longitude: location.longitude,
    };
    const end = {
      latitude: selectedDestination.latitude,
      longitude: selectedDestination.longitude,
    };

    const cachedData = getCachedNavigationData(start, end, transportMode);

    if (cachedData && cachedData.routeData && cachedData.navigationSteps) {
      if (routeService) {
        (routeService as any).lastRawRouteData = cachedData.routeData;
        const navData = routeService.getNavigationData();
        if (navData) {
          setNavigationData(navData);
        } else {
          const directNavData = {
            routeData: cachedData.routeData,
            totalDuration: 0,
            totalDistance: 0,
            steps: cachedData.navigationSteps || [],
          };
          setNavigationData(directNavData);
        }
      } else {
      }

      setPendingRouteRequest(null);
      setIsRecalculatingRoute(false);
    } else {
      setPendingRouteRequest({ start, end, mode: transportMode });
    }

    if (location) {
      animateToCoordinateLocked(
        { latitude: location.latitude, longitude: location.longitude },
        17,
        undefined,
        300
      );
    }
  };

  const handleStopNavigation = () => {
    NavigationService.stopNavigation();
    stopNavigation();
    setIsNavigating(false);
    setShowNavigationGuidance(false);
    setNavigationSteps([]);
    setCurrentStepIndex(0);

    cleanupSafetyTimers();

    clearRoute();

    clearNavigationCache();

    setSuppressArrivalDrawerOnNextArrival(false);
  };

  const handleCloseDrawer = () => {
    setShowRouteDrawer(false);
    setSelectedDestination(null);

    if (wasFollowingBeforeRoute && !selectedParking && !isParkingAnimating) {
      reactivateFollowMode();
      setWasFollowingBeforeRoute(false);
    }

    if (routeSteps.length > 0) {
      setShowMultiStepDrawer(true);
    } else if (!isNavigating) {
      clearRoute();
    }
  };

  const handleTransportModeChange = async (
    mode: string,
    destination: any,
    options?: {
      alternatives?: number;
      avoidTolls?: boolean;
      avoidHighways?: boolean;
    }
  ) => {
    const wasFollowing = disableFollowModeTemporarily();
    setWasFollowingBeforeRoute(wasFollowing);

    if (location) {
      const coord = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      setDestination(coord);

      let osrmMode = "driving";
      switch (mode) {
        case "driving":
          osrmMode = "driving";
          break;
        case "walking":
          osrmMode = "foot";
          break;
        case "bicycling":
          osrmMode = "driving";
          break;
        case "transit":
          osrmMode = "driving";
          break;
      }

      if (
        routeService &&
        typeof (routeService as any).getRoutes === "function"
      ) {
        try {
          const start: Coordinate = {
            latitude: location.latitude,
            longitude: location.longitude,
          };
          const routes = await (routeService as any).getRoutes(
            start,
            destination,
            mode,
            options || {}
          );

          if (routeService.lastRawRouteData && routes && routes.length > 0) {
            const navigationSteps =
              NavigationService.convertRouteToNavigationSteps(
                routeService.lastRawRouteData
              );
            cacheNavigationData(
              start,
              destination,
              mode,
              routeService.lastRawRouteData,
              navigationSteps
            );

            setFreshRouteData(routeService.lastRawRouteData);
          }

          fitToRoute(
            { latitude: location.latitude, longitude: location.longitude },
            {
              latitude: destination.latitude,
              longitude: destination.longitude,
            },
            routeCoords,
            true
          );
        } catch (e) {
          await getHybridRouteFromCurrentLocation(destination, osrmMode);

          if (routeService && routeService.lastRawRouteData) {
            const start: Coordinate = {
              latitude: location.latitude,
              longitude: location.longitude,
            };
            const navigationSteps =
              NavigationService.convertRouteToNavigationSteps(
                routeService.lastRawRouteData
              );
            cacheNavigationData(
              start,
              destination,
              mode,
              routeService.lastRawRouteData,
              navigationSteps
            );

            setFreshRouteData(routeService.lastRawRouteData);
          }
        }
      } else {
        await getHybridRouteFromCurrentLocation(destination, osrmMode);

        if (routeService && routeService.lastRawRouteData) {
          const start: Coordinate = {
            latitude: location.latitude,
            longitude: location.longitude,
          };
          const navigationSteps =
            NavigationService.convertRouteToNavigationSteps(
              routeService.lastRawRouteData
            );
          cacheNavigationData(
            start,
            destination,
            mode,
            routeService.lastRawRouteData,
            navigationSteps
          );

          setFreshRouteData(routeService.lastRawRouteData);
        }
      }

      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        coord,
        routeCoords,
        true
      );
    } else {
      const coord = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      setDestination(coord);
      const adjustedCoord = getAdjustedCoordinate(
        coord,
        undefined,
        undefined,
        350
      );
      animateToCoordinate(adjustedCoord);
    }
  };

  const handleFindParkingFromArrival = (location: {
    latitude: number;
    longitude: number;
  }) => {
    setParkingLocation(location);
    setShowParkingDrawer(true);

    setShowArrivalDrawer(false);
  };

  const handleClearSteps = () => {
    setRouteSteps([]);

    setMultiStepRouteCoords([]);

    setTotalDistance(0);
    setTotalDuration(0);

    setNavigationSteps([]);
    setCurrentStepIndex(0);

    if (isNavigating) {
      handleStopNavigation();
    }

    clearRouteKeepDestination();
  };

  const handleCloseParkingDrawer = () => {
    setShowParkingDrawer(false);
    setParkingLocation(null);

    releaseDrawerCameraControl("parking-drawer");

    setTimeout(() => {
      setSelectedParking(null);
      setIsParkingAnimating(false);
    }, 200);
  };

  const handleSelectParking = (parking: any, useExactSpot?: boolean) => {
    const parkingCoordinate = {
      latitude:
        parking.coordinate?.latitude ||
        parking.coordinates?.[1] ||
        parking.latitude,
      longitude:
        parking.coordinate?.longitude ||
        parking.coordinates?.[0] ||
        parking.longitude,
    };
    setIsParkingAnimating(true);

    setDrawerCameraControl("parking-drawer");

    setSelectedParking({
      coordinate: parkingCoordinate,
      name: parking.name || "Parking sélectionné",
    });

    setTimeout(() => {
      const correctedCoordinate = {
        latitude: parkingCoordinate.latitude - 0.00045,
        longitude: parkingCoordinate.longitude,
      };
      animateToCoordinateLocked(correctedCoordinate, 18, 0);

      setTimeout(() => {
        setIsParkingAnimating(false);
      }, 2500);
    }, 150);

    setShowArrivalDrawer(false);
  };

  const handleNavigateToParking = async (parking: any) => {
    if (!location) {
      return;
    }

    try {
      const parkingCoordinate = {
        latitude:
          parking.coordinate?.latitude ||
          parking.coordinates?.[1] ||
          parking.latitude,
        longitude:
          parking.coordinate?.longitude ||
          parking.coordinates?.[0] ||
          parking.longitude,
      };

      const radius = 50;
      const overpassQuery = `
        [out:json][timeout:25];
        (
          node["entrance"~"^(yes|main|service)$"](around:${radius},${parkingCoordinate.latitude},${parkingCoordinate.longitude});
          node["amenity"="parking_entrance"](around:${radius},${parkingCoordinate.latitude},${parkingCoordinate.longitude});
          node["barrier"="entrance"](around:${radius},${parkingCoordinate.latitude},${parkingCoordinate.longitude});
        );
        out geom;
      `;

      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
        overpassQuery
      )}`;
      const response = await fetch(overpassUrl);
      const data = await response.json();

      let entranceCoordinate = parkingCoordinate;

      if (data.elements && data.elements.length > 0) {
        let closestEntrance = data.elements[0];
        let minDistance = Infinity;

        for (const entrance of data.elements) {
          const distance = getDistanceBetweenPoints(
            location.latitude,
            location.longitude,
            entrance.lat,
            entrance.lon
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestEntrance = entrance;
          }
        }

        entranceCoordinate = {
          latitude: closestEntrance.lat,
          longitude: closestEntrance.lon,
        };
      } else {
      }

      setShowParkingDrawer(false);

      setSuppressArrivalDrawerOnNextArrival(true);

      setHasReachedDestination(false);
      setShowArrivalDrawer(false);

      const wasFollowing = disableFollowModeTemporarily();
      setWasFollowingBeforeRoute(wasFollowing);

      setDestination(entranceCoordinate);

      setSelectedDestination({
        title: parking.name || "Entrée de parking",
        subtitle: "Navigation vers l'entrée",
        latitude: entranceCoordinate.latitude,
        longitude: entranceCoordinate.longitude,
      });

      await getHybridRouteFromCurrentLocation(entranceCoordinate, "driving");

      fitToRoute(
        { latitude: location.latitude, longitude: location.longitude },
        entranceCoordinate,
        routeCoords,
        true
      );

      setShowRouteDrawer(true);
    } catch (error) {
      const parkingCoordinate = {
        latitude:
          parking.coordinate?.latitude ||
          parking.coordinates?.[1] ||
          parking.latitude,
        longitude:
          parking.coordinate?.longitude ||
          parking.coordinates?.[0] ||
          parking.longitude,
      };

      handleStartRouteFromLocation(parkingCoordinate);
    }
  };

  const handleRecenter = async () => {
    if (location) {
      await recenterMap(location);
    }
  };

  return (
    <View style={styles.container}>
      <Modal
        visible={showLocationTimeoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLocationTimeoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="location-off" size={32} color="#FF9500" />
              <Text style={styles.modalTitle}>Localisation non trouvée</Text>
            </View>
            <Text style={styles.modalDescription}>
              Impossible de récupérer votre position après 10 secondes. Vérifiez
              les autorisations ou réessayez.
            </Text>
            <View style={styles.modalButtonsVertical}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleRetryLocation}
              >
                <MaterialIcons name="refresh" size={20} color="#FFF" />
                <Text style={styles.modalButtonTextPrimary}>Réessayer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={handleContinueWithoutLocation}
              >
                <MaterialIcons name="block" size={20} color="#FF3B30" />
                <Text style={styles.modalButtonTextSecondary}>
                  Continuer sans localisation
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showLocationErrorModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLocationErrorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="location-off" size={32} color="#FF3B30" />
              <Text style={styles.modalTitle}>Problème de localisation</Text>
            </View>
            <Text style={styles.modalDescription}>
              Impossible de récupérer votre position actuelle. Vérifiez que les
              services de localisation sont activés et que l'application a
              l'autorisation d'accéder à la localisation.
            </Text>
            <View style={styles.modalButtonsVertical}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => setShowLocationErrorModal(false)}
              >
                <MaterialIcons name="close" size={20} color="#FFF" />
                <Text style={styles.modalButtonTextPrimary}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ResumeTripModal
        visible={resumeModalVisible}
        destination={lastTrip?.destination || {}}
        mode={lastTrip?.mode || "driving"}
        onValidate={handleResumeTrip}
        onCancel={handleCancelResumeTrip}
      />
      {!isNavigating && (
        <ExpandableSearch
          value={search}
          onChangeText={setSearch}
          onSelectLocation={handleSelectLocation}
          onShowRoute={handleShowRoute}
          onShowPOI={handleShowPOI}
          onAddStep={handleAddStep}
          onResumeLastTrip={() => setResumeModalVisible(true)}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          onCameraMove={(coordinate, offset) => {
            if (coordinate) {
              setTimeout(() => {
                if (offset) {
                  const screenHeight = Dimensions.get("window").height;
                  const latitudeDelta = 0.01;
                  const offsetLat = (offset.y / screenHeight) * latitudeDelta;
                  const adjustedCoord = {
                    latitude: coordinate.latitude + offsetLat,
                    longitude: coordinate.longitude,
                    pitch: 0,
                  };
                  animateToCoordinateLocked(adjustedCoord);
                } else {
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }
              }, 100);
            } else {
              if (location) {
                setTimeout(() => {
                  const adjustedCoord = getAdjustedCoordinate(
                    location,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }, 100);
              }
            }
          }}
          onImportGpx={handleImportGpx}
        />
      )}

      {showNavigationSearch && (
        <ExpandableSearch
          value={search}
          onChangeText={setSearch}
          onSelectLocation={(result) => {
            handleSelectLocation(result);
            setShowNavigationSearch(false);
          }}
          onShowRoute={handleShowRoute}
          onShowPOI={handleShowPOI}
          onAddStep={handleAddStep}
          onResumeLastTrip={() => setResumeModalVisible(true)}
          onImportGpx={handleImportGpx}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          isNavigating={isNavigating}
          onAddNavigationStop={(result) => {
            handleAddNavigationStop(result);
            setShowNavigationSearch(false);
          }}
          onSearchNearbyPOI={handleSearchNearbyPOI}
          placeholder="Rechercher un arrêt..."
          autoExpand={true}
          onClose={() => setShowNavigationSearch(false)}
          onCameraMove={(coordinate, offset) => {
            if (coordinate) {
              setTimeout(() => {
                if (offset) {
                  const screenHeight = Dimensions.get("window").height;
                  const latitudeDelta = 0.01;
                  const offsetLat = (offset.y / screenHeight) * latitudeDelta;
                  const adjustedCoord = {
                    latitude: coordinate.latitude + offsetLat,
                    longitude: coordinate.longitude,
                    pitch: 0,
                  };
                  animateToCoordinateLocked(adjustedCoord);
                } else {
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }
              }, 100);
            } else {
              if (location) {
                setTimeout(() => {
                  const adjustedCoord = getAdjustedCoordinate(
                    location,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinateLocked(adjustedCoord);
                }, 100);
              }
            }
          }}
        />
      )}

      {routeSteps.length > 0 && (
        <TouchableOpacity
          style={styles.multiStepButton}
          onPress={() => setShowMultiStepDrawer(true)}
          onLongPress={async () => {
            try {
              const res = await DocumentPicker.getDocumentAsync({
                type: "*/*",
              });
              if (!res.canceled && res.assets && res.assets.length > 0) {
                const asset = res.assets[0];
                if (
                  asset.uri &&
                  asset.name &&
                  asset.name.toLowerCase().endsWith(".gpx")
                ) {
                  const resp = await fetch(asset.uri);
                  const text = await resp.text();
                  const parsed = parseGPX(text);
                  const first =
                    parsed.waypoints.length > 0
                      ? parsed.waypoints[0]
                      : parsed.track[0];
                  if (first) {
                    setSelectedDestination({
                      title: first.name || "Imported GPX",
                      subtitle: "",
                      latitude: first.latitude,
                      longitude: first.longitude,
                    });
                    if (parsed.track && parsed.track.length > 0) {
                      setImportedRouteCoords(
                        parsed.track.map((p) => ({
                          latitude: p.latitude,
                          longitude: p.longitude,
                          elevation: (p as any).elevation,
                        }))
                      );
                    }
                    setShowRouteDrawer(true);
                  }
                }
              }
            } catch (e) {}
          }}
        >
          <MaterialIcons name="route" size={20} color="#FFF" />
          <Text style={styles.multiStepButtonText}>
            Itinéraire ({routeSteps.length} étapes)
          </Text>
        </TouchableOpacity>
      )}

      <>
        <MapContainer
          mapHeadingOverride={cameraHeadingOverride}
          location={location}
          headingAnim={headingAnim}
          destination={destination}
          routeCoords={routeCoords}
          alternativeRoutes={
            routeService ? routeService.lastAlternatives || [] : []
          }
          selectedAlternativeIndex={selectedAlternativeIndex}
          gpxRouteCoords={importedRouteCoords}
          onLongPress={handleMapPress}
          compassMode={compassMode}
          currentHeading={currentHeading}
          onMapPanDrag={() => {
            handleMapPanDrag();
            if (showGpxDrawer) setGpxMinimizeSignal((s) => s + 1);
          }}
          pois={allPOIs}
          selectedPOI={selectedPOI}
          isFirstLoad={!location}
          isNavigating={isNavigating}
          navigationMode={navigationMode}
          showDirectLine={isNavigating && navigationMode === "walking"}
          navigationSteps={navigationSteps}
          currentStepIndex={currentStepIndex}
          onNavigationStepPress={handleNavigationStepPress}
          directLineCoords={directLineCoords}
          nearestRoadPoint={nearestRoadPoint}
          hasDirectLineSegment={hasDirectLineSegment}
          showLocationPoint={showLocationPoint}
          selectedLocationCoordinate={selectedLocationCoordinate}
          selectedParking={selectedParking}
          completedRouteCoords={completedRouteCoords}
          remainingRouteCoords={remainingRouteCoords}
          progressPercentage={progressPercentage}
          routeDirection={routeDirection}
        />

        {isNavigating && (
          <ProgressSidebar progressPercentage={progressPercentage} />
        )}

        <ControlButtons
          onRecenter={handleRecenter}
          onToggleCompass={toggleCompassMode}
          compassMode={compassMode}
          isFollowingUser={isFollowingUser}
          isNavigating={isNavigating}
          onOpenFavorites={() => setShowFavorites(true)}
        />

        <RouteDrawer
          visible={showRouteDrawer}
          destination={selectedDestination}
          onClose={handleCloseDrawer}
          onStartNavigation={handleStartNavigation}
          onTransportModeChange={handleTransportModeChange}
          alternatives={routeService ? routeService.lastAlternatives || [] : []}
          selectedAlternativeIndex={selectedAlternativeIndex}
          onSelectAlternative={async (index: number) => {
            setSelectedAlternativeIndex(index);
            if (
              routeService &&
              typeof (routeService as any).selectAlternative === "function"
            ) {
              (routeService as any).selectAlternative(index);
            }
            if (location && selectedDestination) {
              fitToRoute(
                { latitude: location.latitude, longitude: location.longitude },
                {
                  latitude: selectedDestination.latitude,
                  longitude: selectedDestination.longitude,
                },
                routeCoords,
                true
              );
            }
          }}
          onOpened={() => {
            const activeCoords =
              importedRouteCoords && importedRouteCoords.length > 0
                ? importedRouteCoords
                : routeCoords;
            if (
              location &&
              selectedDestination &&
              activeCoords &&
              activeCoords.length > 0
            ) {
              fitToRoute(
                { latitude: location.latitude, longitude: location.longitude },
                {
                  latitude: selectedDestination.latitude,
                  longitude: selectedDestination.longitude,
                },
                activeCoords,
                true
              );
            }
          }}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          isCalculatingRoute={routeService ? routeService.isCalculating : false}
          isOsrmAvailable={routeService ? routeService.isOsrmAvailable : true}
          provider={routeService ? routeService.routingHost : undefined}
          lastRequestTimings={
            routeService ? routeService.lastRequestTimings : undefined
          }
        />

        <GPXDrawer
          visible={showGpxDrawer}
          track={importedRouteCoords}
          onClose={() => {
            if (handleClearGpxOverlays) handleClearGpxOverlays();
            setShowGpxDrawer(false);
            reactivateFollowMode();
          }}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          onNavigateToStart={async (start) => {
            if (location) {
              try {
                await getHybridRouteFromCurrentLocation(
                  start,
                  navigationMode || "driving"
                );
              } catch (e) {}

              try {
                reactivateFollowMode();
              } catch (e) {}

              setPendingRouteRequest({
                start: {
                  latitude: location.latitude,
                  longitude: location.longitude,
                },
                end: start,
                mode: navigationMode || "driving",
              });
              setShowNavigationGuidance(true);
              setGpxStartPoint(start);
            }
            setShowGpxDrawer(false);
          }}
          minimizeSignal={gpxMinimizeSignal}
          onOpened={() => {
            disableFollowModeTemporarily();
            if (
              importedRouteCoords &&
              importedRouteCoords.length > 1 &&
              fitToRoute
            ) {
              const startCoord = location
                ? { latitude: location.latitude, longitude: location.longitude }
                : importedRouteCoords[0];
              fitToRoute(
                startCoord,
                importedRouteCoords[importedRouteCoords.length - 1],
                importedRouteCoords,
                true
              );
              setTimeout(() => {
                const n = importedRouteCoords.length;
                const mid = importedRouteCoords[Math.floor(n / 2)];
                if (mid) {
                  const adjustedMid = getAdjustedCoordinate(
                    mid,
                    undefined,
                    undefined,
                    GPX_DRAWER_HEIGHT,
                    140
                  );
                  animateToCoordinateLocked(adjustedMid);
                }
              }, 450);
            }
          }}
          importing={gpxImporting}
          importProgress={gpxImportProgress}
          onClearRoute={handleClearGpxOverlays}
          onStopNavigation={handleStopNavigation}
          onStartFollowingTrack={handleStartFollowingGpx}
        />

        <GPXStartDrawer
          visible={gpxStartArrivalVisible}
          start={gpxStartPoint}
          onStartGpx={() => {
            if (importedRouteCoords && importedRouteCoords.length > 1) {
              const gpxSteps =
                NavigationService.convertGpxTrackToNavigationSteps(
                  importedRouteCoords
                );
              NavigationService.startNavigation(gpxSteps, routeService, "gpx");
              setNavigationSteps(gpxSteps);
              setCurrentStepIndex(0);
              setIsNavigating(true);
              setShowRouteDrawer(false);
              setGpxStartArrivalVisible(false);
              setShowNavigationGuidance(true);
            }
          }}
          onClose={() => setGpxStartArrivalVisible(false)}
        />

        <POIDrawer
          visible={showPOIDrawer}
          amenityType={selectedAmenityType}
          userLocation={
            customPOILocation ||
            (location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null)
          }
          onClose={handleClosePOIDrawer}
          onSelectPOI={handleSelectPOI}
          onShowRoute={handlePOIRoute}
          onRadiusChange={handlePOIRadiusChange}
          onPOIsFound={handlePOIsFound}
          initialRadius={poiRadius}
          preloadedPois={allPOIs.length > 0 ? allPOIs : undefined}
          isNavigating={isNavigating}
          onCameraMove={(coordinate, offset) => {
            if (coordinate) {
              setTimeout(() => {
                if (offset && typeof offset.y === "number") {
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    offset.y
                  );
                  animateToCoordinate(adjustedCoord);
                } else {
                  const adjustedCoord = getAdjustedCoordinate(
                    coordinate,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinate(adjustedCoord);
                }
              }, 100);
            } else {
              if (location) {
                setTimeout(() => {
                  const adjustedCoord = getAdjustedCoordinate(
                    location,
                    undefined,
                    undefined,
                    0
                  );
                  animateToCoordinate(adjustedCoord);
                }, 100);
              }
            }
          }}
          onAddNavigationStop={(poi) => {
            const result = {
              id: `poi_${poi.id}`,
              title: poi.tags.name || poi.tags.amenity || "POI",
              subtitle:
                poi.tags.addr_street ||
                `${poi.tags.amenity} - ${Math.round(poi.distance || 0)}m`,
              latitude: poi.lat,
              longitude: poi.lon,
              type: "overpass" as const,
              amenityType: poi.tags.amenity,
            };
            handleAddNavigationStop(result);
            setShowPOIDrawer(false);
          }}
        />

        <FavoritesDrawer
          visible={showFavorites}
          onClose={() => setShowFavorites(false)}
          onSelect={(item) => {
            setShowFavorites(false);
            const dest = {
              id: item.id,
              title: item.title,
              subtitle: item.subtitle || "",
              latitude: item.latitude,
              longitude: item.longitude,
              type: item.type === "overpass" ? "overpass" : "nominatim",
            };
            handleSelectLocation(dest as any);
          }}
        />

        <MultiStepRouteDrawer
          visible={showMultiStepDrawer}
          steps={routeSteps}
          userLocation={
            location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null
          }
          onClose={handleCloseMultiStepDrawer}
          onAddStep={(step) => {
            setRouteSteps((prev) => [...prev, step]);
          }}
          onRemoveStep={handleRemoveStep}
          onReorderSteps={handleReorderSteps}
          onCalculateRoute={handleCalculateMultiStepRoute}
          onStartNavigation={handleStartMultiStepNavigation}
          onShowPOIsOnMap={(pois) => {
            setAllPOIs(pois);
          }}
          onSelectPOIOnMap={(poi) => {
            setSelectedPOI(poi);
          }}
          totalDistance={totalDistance}
          totalDuration={totalDuration}
        />

        <NavigationGuidance
          visible={showNavigationGuidance || isNavigating || isMapNavigating}
          onStop={handleStopNavigation}
          onShowAllSteps={() => {
            if (
              location &&
              destination &&
              routeCoords &&
              routeCoords.length > 0
            ) {
              fitToRoute(
                { latitude: location.latitude, longitude: location.longitude },
                destination,
                routeCoords,
                true
              );
            }
          }}
          onAddNavigationStep={() => setShowNavigationSearch(true)}
          isRecalculatingRoute={isRecalculatingRoute}
          showRecenterPrompt={showRecenterPrompt}
          onManualRecenter={manualRecenter}
          currentLocation={location}
          routeRequest={pendingRouteRequest}
          routeData={routeService ? routeService.lastRawRouteData : null}
          navigationData={navigationData}
          isOffRouteOverride={false}
          onRouteReady={() => {
            setPendingRouteRequest(null);
            setIsNavigating(true);
            setIsRecalculatingRoute(false);
          }}
          onNewRouteCalculated={(newRouteData) => {
            if (routeService && newRouteData) {
              routeService.updateRouteData(newRouteData);

              setFreshRouteData(newRouteData);

              setIsRecalculatingRoute(false);

              offRouteRecalcRunningRef.current = false;
            }
          }}
        />

        
        <LocationInfoDrawer
          visible={showLocationInfoDrawer}
          coordinate={selectedLocationCoordinate}
          onClose={() => setShowLocationInfoDrawer(false)}
          onStartRoute={handleStartRouteFromLocation}
          hasActiveRoute={!!destination || isNavigating}
          onShowLocationPoint={handleShowLocationPoint}
        />

        <NavigationStepDrawer
          visible={showNavigationStepDrawer}
          step={selectedNavigationStep}
          stepIndex={selectedStepIndex}
          totalSteps={navigationSteps.length}
          onClose={handleCloseNavigationStepDrawer}
          isCurrentStep={selectedStepIndex === currentStepIndex}
          isCompletedStep={selectedStepIndex < currentStepIndex}
        />

        <ArrivalDrawer
          visible={showArrivalDrawer}
          destination={
            destination
              ? {
                  coordinate: {
                    latitude: destination.latitude,
                    longitude: destination.longitude,
                  },
                  name:
                    selectedDestination?.display_name ||
                    selectedDestination?.name,
                  address: selectedDestination?.address,
                }
              : null
          }
          onClose={handleCloseArrivalDrawer}
          onNavigateAgain={handleNavigateAgain}
          onDisableFollowUser={handleDisableFollowUserForArrival}
          onEnableFollowUser={handleEnableFollowUserForArrival}
          onAdjustCamera={handleAdjustCameraForArrival}
          onFindParking={handleFindParkingFromArrival}
          onClearSteps={handleClearSteps}
        />

        <ParkingDrawer
          visible={showParkingDrawer}
          searchLocation={parkingLocation}
          onClose={handleCloseParkingDrawer}
          onParkingSelect={handleSelectParking}
          onNavigateToParking={handleNavigateToParking}
        />

        <Modal
          visible={showSafetyModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowSafetyModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <MaterialIcons name="warning" size={32} color="#FF9500" />
                <Text style={styles.modalTitle}>Sécurité routière</Text>
              </View>

              <Text style={styles.modalDescription}>
                Votre trajet dure plus de 2 heures (
                {Math.round(longTripDuration / 60)}h
                {String(longTripDuration % 60).padStart(2, "0")}). Pour votre
                sécurité et celle des autres usagers, il est recommandé de faire
                une pause ou de changer de conducteur toutes les 2 heures.
              </Text>

              <View style={styles.modalButtonsVertical}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => handleSafetyChoice("remind")}
                >
                  <MaterialIcons name="access-time" size={20} color="#FFF" />
                  <Text style={styles.modalButtonTextPrimary}>
                    Me rappeler dans 2h
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleSafetyChoice("rest-stops")}
                >
                  <MaterialIcons
                    name="local-gas-station"
                    size={20}
                    color="#007AFF"
                  />
                  <Text style={styles.modalButtonTextSecondary}>
                    Trouver des aires de repos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleSafetyChoice("ignore")}
                >
                  <MaterialIcons name="close" size={20} color="#FF3B30" />
                  <Text
                    style={[
                      styles.modalButtonTextSecondary,
                      { color: "#FF3B30" },
                    ]}
                  >
                    Ignorer et continuer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showRestReminder}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowRestReminder(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <MaterialIcons name="schedule" size={32} color="#FF9500" />
                <Text style={styles.modalTitle}>Temps de pause</Text>
              </View>

              <Text style={styles.modalDescription}>
                Il est temps de faire une pause ! Vous conduisez depuis 2
                heures. Prenez quelques minutes pour vous reposer ou cherchez
                une aire de repos à proximité.
              </Text>

              <View style={styles.modalButtonsVertical}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => handleRestReminderAction("find-stop")}
                >
                  <MaterialIcons
                    name="local-gas-station"
                    size={20}
                    color="#FFF"
                  />
                  <Text style={styles.modalButtonTextPrimary}>
                    Trouver une aire de repos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleRestReminderAction("rest")}
                >
                  <MaterialIcons name="pause" size={20} color="#007AFF" />
                  <Text style={styles.modalButtonTextSecondary}>
                    Je prends une pause ici
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleRestReminderAction("ignore")}
                >
                  <MaterialIcons name="schedule" size={20} color="#FF9500" />
                  <Text
                    style={[
                      styles.modalButtonTextSecondary,
                      { color: "#FF9500" },
                    ]}
                  >
                    Rappeler dans 2h
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {routeService.routingErrorMessage && (
          <View style={styles.routingErrorNotification}>
            <View style={styles.routingErrorContainer}>
              <MaterialIcons name="error-outline" size={20} color="#FF6B6B" />
              <Text style={styles.routingErrorText}>
                {routeService.routingErrorMessage}
              </Text>
            </View>
          </View>
        )}
      </>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
  },
  multiStepButton: {
    position: "absolute",
    top: 100,
    right: 16,
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  multiStepButtonText: {
    color: "#FFF",
    fontWeight: "bold",
    marginLeft: 4,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    maxWidth: 340,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
    textAlign: "center",
  },
  modalText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalButtonsVertical: {
    flexDirection: "column",
    gap: 12,
    width: "100%",
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
    width: "100%",
    gap: 8,
  },
  modalButtonHorizontal: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
    gap: 8,
  },
  modalButtonPrimary: {
    backgroundColor: "#007AFF",
  },
  modalButtonSecondary: {
    backgroundColor: "#F2F2F7",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  modalButtonTextPrimary: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center",
  },
  modalButtonTextSecondary: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center",
  },
  modalContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    maxWidth: 360,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  modalDescription: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  routingErrorNotification: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    zIndex: 10000,
    alignItems: "center",
  },
  routingErrorContainer: {
    backgroundColor: "#FFEBEE",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "90%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  routingErrorText: {
    fontSize: 14,
    color: "#D32F2F",
    fontWeight: "500",
    flex: 1,
  },
});

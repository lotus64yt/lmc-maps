import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  Text,
  FlatList,
  Animated,
  Dimensions,
  SafeAreaView,
  Modal,
  Vibration,
  LayoutAnimation,
  UIManager,
  Platform,
  useWindowDimensions,
} from "react-native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import SettingsOverlay from "./SettingsOverlay";
import {
  NominatimService,
  NominatimSearchResult,
} from "../services/NominatimService";
import { FavoritesService } from '../services/FavoritesService';
import {
  RouteHistoryService,
} from "../services/RouteHistoryService";
import { OverpassService, OverpassPOI } from "../services/OverpassService";
import OverPassAmenityList, {
  AmenityType,
} from "../assets/overpass/amenityList";

const SearchResultItem = memo(
  ({
    item,
    onSelectResult,
    onShowRoute,
    onAddNavigationStop,
    onAddStep,
  onToggleFavorite,
  isFavorite,
    isNavigating,
    getCategoryColor,
    onDeleteHistoryItem,
  }: {
    item: SearchResult;
    onSelectResult: (result: SearchResult) => void;
    onShowRoute?: (result: SearchResult) => void;
    onAddNavigationStop?: (result: SearchResult) => void;
  onAddStep?: (result: SearchResult) => void;
  onToggleFavorite?: (result: SearchResult) => void;
  isFavorite?: (id: string) => boolean;
    isNavigating: boolean;
    getCategoryColor: (type: AmenityType) => string;
    onDeleteHistoryItem: (id: string) => void;
  }) => {
    if (item.amenityType?.startsWith("category_")) {
      const categoryType = item.amenityType.replace(
        "category_",
        ""
      ) as AmenityType;
      return (
        <View style={styles.categoryHeader}>
          <Text
            style={[
              styles.categoryTitle,
              { color: getCategoryColor(categoryType) },
            ]}
          >
            {item.title}
          </Text>
          <Text style={styles.categorySubtitle}>{item.subtitle}</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.resultItem}
        onPress={() => onSelectResult(item)}
      >
        <View style={styles.resultContent}>
          <Icon
            name={
              item.type === "history"
                ? "history"
                : item.type === "nominatim"
                ? "place"
                : "local-activity"
            }
            size={20}
            color={
              item.type === "history"
                ? "#FF9500"
                : item.type === "nominatim"
                ? "#666"
                : "#9C27B0"
            }
            style={styles.resultIcon}
          />
          <View style={styles.resultText}>
            <View style={styles.titleRow}>
              <Text style={styles.resultTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {item.type === "history" &&
                item.searchCount &&
                item.searchCount > 1 && (
                  <View style={styles.searchCountBadge}>
                    <Text style={styles.searchCountText}>
                      {item.searchCount}
                    </Text>
                  </View>
                )}
            </View>
            <Text style={styles.resultSubtitle} numberOfLines={2}>
              {item.subtitle}
            </Text>
          </View>
          {(item.type === "nominatim" || item.type === "history" || item.type === 'overpass') &&
            onShowRoute &&
            !isNavigating && (
              <TouchableOpacity
                style={styles.routeButton}
                onPress={() => onShowRoute(item)}
              >
                <Icon name="directions" size={20} color="#007AFF" />
              </TouchableOpacity>
            )}
          {}
          {isNavigating &&
            (item.type === "nominatim" ||
              item.type === "history" ||
              item.type === "overpass") &&
            onAddNavigationStop && (
              <TouchableOpacity
                style={styles.navigationStopButton}
                onPress={() => {
                  Vibration.vibrate(50);
                  onAddNavigationStop(item);
                }}
              >
                <Icon name="add-location" size={20} color="#FF9500" />
              </TouchableOpacity>
            )}
          {(item.type === "nominatim" ||
            item.type === "history" ||
            item.type === "overpass") &&
            onAddStep &&
            !isNavigating && (
              <TouchableOpacity
                style={styles.addStepButton}
                onPress={() => {
                  Vibration.vibrate(50);
                  onAddStep(item);
                }}
              >
                <Icon name="add" size={20} color="#4CAF50" />
              </TouchableOpacity>
            )}
          {item.type === "history" && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => {
                Vibration.vibrate(50);
                onDeleteHistoryItem(item.id);
              }}
            >
              <Icon name="close" size={16} color="#999" />
            </TouchableOpacity>
          )}
          {}
          {(item.type === 'nominatim' || item.type === 'history' || item.type === 'overpass') && onToggleFavorite && (
            <TouchableOpacity style={styles.favoriteButton} onPress={() => onToggleFavorite(item)}>
              <Icon name={isFavorite && isFavorite(item.id) ? 'star' : 'star-border'} size={20} color="#FFB300" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }
);

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  type: "nominatim" | "overpass" | "history";
  searchCount?: number;
  amenityType?: string;
}

interface ExpandableSearchProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectLocation: (result: SearchResult) => void;
  onShowRoute?: (destination: SearchResult) => void;
  onShowPOI?: (amenityType: string, preloadedPois?: OverpassPOI[]) => void;
  onAddStep?: (step: SearchResult) => void;
  userLocation?: { latitude: number; longitude: number } | null;
  placeholder?: string;
  isNavigating?: boolean;
  onAddNavigationStop?: (result: SearchResult) => void;
  onSearchNearbyPOI?: (amenityType: string) => void;
  autoExpand?: boolean;
  onClose?: () => void;
  onResumeLastTrip?: () => void;
  onCameraMove?: (coordinate: { latitude: number; longitude: number } | null, offset?: { x: number; y: number }) => void;
  onImportGpx?: () => void;
}

export default function ExpandableSearch({
  value,
  onChangeText,
  onSelectLocation,
  onShowRoute,
  onShowPOI,
  onAddStep,
  userLocation,
  placeholder = "Rechercher un lieu...",
  isNavigating = false,
  onAddNavigationStop,
  onSearchNearbyPOI,
  autoExpand = false,
  onClose,
  onResumeLastTrip,
  onCameraMove,
  onImportGpx,
}: ExpandableSearchProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const animatedHeightsRef = useRef<Record<string, Animated.Value>>({});
  const animatedRotationsRef = useRef<Record<string, Animated.Value>>({});
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<"address" | "poi" | "recent">("address");
  const [shouldSearch, setShouldSearch] = useState(false);
  const [historyItems, setHistoryItems] = useState<SearchResult[]>([]);
  const searchTimeout = useRef<NodeJS.Timeout>();

  const expandAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const expandedInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    loadHistory();
    loadFavorites();
  }, [userLocation?.latitude, userLocation?.longitude]);

  const loadFavorites = async () => {
    try {
      const favs = await FavoritesService.listFavorites();
      setFavoriteIds(favs.map((f) => f.id));
    } catch (e) {
    }
  };

  const handleToggleFavorite = async (result: SearchResult) => {
    try {
      const favItem = {
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        latitude: result.latitude,
        longitude: result.longitude,
        type: result.type,
      };
      await FavoritesService.toggleFavorite(favItem);
      Vibration.vibrate(30);
      loadFavorites();
    } catch (e) {
    }
  };

  const loadHistory = async () => {
    try {
      const history = await RouteHistoryService.getHistory();

      const filteredHistory = userLocation
        ? RouteHistoryService.filterByLocation(
            history,
            userLocation.latitude,
            userLocation.longitude,
            100
          )
        : history.slice(0, 5);

      const historyResults: SearchResult[] = filteredHistory.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        latitude: item.latitude,
        longitude: item.longitude,
        type: "history" as const,
        searchCount: item.searchCount,
      }));

      setHistoryItems(historyResults);
    } catch (error) {
    }
  };

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      try {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      } catch (e) {
      }
    }
  }, []);

  useEffect(() => {
    Animated.timing(listAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [isExpanded, searchMode, searchResults.length, historyItems.length]);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [searchResults, historyItems, searchMode]);

  useEffect(() => {
    if (autoExpand && !isExpanded) {
      setIsExpanded(true);
    }
  }, [autoExpand]);

  const handleClose = () => {
    setIsExpanded(false);
    if (onClose) {
      onClose();
    }
  };

  const detectCoordinates = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const patterns = [
      /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)\s*,\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/,
      /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)\s+[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/,
      /^\d{1,3}°\d{1,2}['′]\d{1,2}(\.\d+)?["″][NS]\s*\d{1,3}°\d{1,2}['′]\d{1,2}(\.\d+)?["″][EW]$/i,
      /^\d{1,3}°\d{1,2}\.\d+['′][NS]\s*\d{1,3}°\d{1,2}\.\d+['′][EW]$/i,
    ];

    return patterns.some((pattern) => pattern.test(trimmed));
  };

  const parseCoordinates = (
    text: string
  ): { latitude: number; longitude: number } | null => {
    const trimmed = text.trim();

    const ddMatch = trimmed.match(
      /^([-+]?[1-8]?\d(?:\.\d+)?|90(?:\.0+)?)\s*[,\s]\s*([-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d+)?))$/
    );
    if (ddMatch) {
      return {
        latitude: parseFloat(ddMatch[1]),
        longitude: parseFloat(ddMatch[2]),
      };
    }

    return null;
  };

  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (isExpanded && searchMode === "address" && value.trim().length > 0) {
      const isCoordinates = detectCoordinates(value);

      if (isCoordinates) {
        const coords = parseCoordinates(value);
        if (coords) {
          setSearchResults([
            {
              id: `coordinates_${coords.latitude}_${coords.longitude}`,
              title: "📍 Aller à ce point",
              subtitle: `${coords.latitude.toFixed(
                6
              )}, ${coords.longitude.toFixed(6)}`,
              latitude: coords.latitude,
              longitude: coords.longitude,
              type: "nominatim",
            },
          ]);
        }
        setIsLoading(false);
        return;
      }
    }

    if (
      isExpanded &&
      shouldSearch &&
      searchMode === "address" &&
      value.trim().length > 2
    ) {
      searchTimeout.current = setTimeout(() => {
        performSearch(value);
        setShouldSearch(false);
      }, 1500);
    } else if (isExpanded && searchMode === "poi") {
      searchPOIs(value);
    } else if (value.trim().length <= 2 && searchMode === "address") {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [value, searchMode, isExpanded, shouldSearch]);

  const performSearch = async (query: string) => {
    setIsLoading(true);
    try {
      if (searchMode === "address") {
        await searchAddresses(query);
      } else {
        await searchPOIs(query);
      }
    } catch (error) {
      setSearchResults([]);
    }
    setIsLoading(false);
  };

  const searchAddresses = async (query: string) => {
    const results = await NominatimService.search(query, { limit: 8 });

    const formattedResults: SearchResult[] = results.map((result) => ({
      id: result.place_id.toString(),
      title: getDisplayTitle(result),
      subtitle: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      type: "nominatim",
    }));

    const combinedResults = [...historyItems, ...formattedResults];

    const uniqueResults = combinedResults.filter((item, index, arr) => {
      return (
        arr.findIndex(
          (other) =>
            Math.abs(other.latitude - item.latitude) < 0.0001 &&
            Math.abs(other.longitude - item.longitude) < 0.0001
        ) === index
      );
    });

    const sortedResults = uniqueResults.sort((a, b) => {
      if (a.type === "history" && b.type !== "history") return -1;
      if (a.type !== "history" && b.type === "history") return 1;
      if (a.type === "history" && b.type === "history") {
        return (b.searchCount || 0) - (a.searchCount || 0);
      }
      return 0;
    });

    setSearchResults(sortedResults);
  };

  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  const searchPOIs = async (query: string) => {
    const normalizedQuery = normalizeText(query.trim());

    let matchingAmenities = OverPassAmenityList;

    if (normalizedQuery.length > 0) {
      matchingAmenities = OverPassAmenityList.filter((amenity) => {
        const normalizedLabel = normalizeText(amenity.label);
        const normalizedDescription = normalizeText(amenity.description || "");
        const normalizedValue = normalizeText(amenity.value);
        const normalizedType = normalizeText(amenity.type);

        return (
          normalizedLabel.includes(normalizedQuery) ||
          normalizedDescription.includes(normalizedQuery) ||
          normalizedValue.includes(normalizedQuery) ||
          normalizedType.includes(normalizedQuery)
        );
      });
    }

    const groupedByType = matchingAmenities.reduce((acc, amenity) => {
      if (!acc[amenity.type]) {
        acc[amenity.type] = [];
      }
      acc[amenity.type].push(amenity);
      return acc;
    }, {} as Record<AmenityType, typeof matchingAmenities>);

    const poiResults: SearchResult[] = [];

    const categoryOrder: AmenityType[] = [
      "Sustenance",
      "Education",
      "Transportation",
      "Finance",
      "Healthcare",
      "Entertainment",
      "PublicService",
      "Facilities",
      "Waste",
      "Other",
    ];

    categoryOrder.forEach((category) => {
      if (groupedByType[category] && groupedByType[category].length > 0) {
        poiResults.push({
          id: `category_${category}`,
          title: getCategoryEmoji(category) + " " + category,
          subtitle: `${groupedByType[category].length} options disponibles`,
          latitude: 0,
          longitude: 0,
          type: "overpass",
          amenityType: `category_${category}`,
        });

        groupedByType[category].forEach((amenity, index) => {
          poiResults.push({
            id: `poi_${amenity.value}_${index}`,
            title: `${amenity.label}`,
            subtitle:
              amenity.description ||
              `Rechercher des ${amenity.label.toLowerCase()} à proximité`,
            latitude: userLocation?.latitude || 0,
            longitude: userLocation?.longitude || 0,
            type: "overpass",
            amenityType: amenity.value,
          });
        });
      }
    });

    setSearchResults(poiResults);
  };

  const handlePOISearch = async (amenityType: string) => {
    if (!userLocation || !onShowPOI) return;

    try {
      const results = await OverpassService.searchPOI(
        userLocation.latitude,
        userLocation.longitude,
        5000,
        amenityType
      );

      onShowPOI(amenityType, results);
    } catch (error) {
      onShowPOI(amenityType);
    }
  };

  const handleSelectResultCallback = useCallback(
    (result: SearchResult) => {
      Vibration.vibrate(50);

      if (result.amenityType?.startsWith("category_")) {
        return;
      }

      if (result.type === "overpass") {
        if (result.amenityType && onShowPOI && userLocation) {
          handlePOISearch(result.amenityType);
          setIsExpanded(false);
          setSearchResults([]);
          return;
        }
      }

      if (result.type !== "history") {
        RouteHistoryService.addToHistory({
          title: result.title,
          subtitle: result.subtitle,
          latitude: result.latitude,
          longitude: result.longitude,
        }).then(() => {
          loadHistory();
        });
      } else {
        RouteHistoryService.addToHistory({
          title: result.title,
          subtitle: result.subtitle,
          latitude: result.latitude,
          longitude: result.longitude,
        }).then(() => {
          loadHistory();
        });
      }

      if (result.type === 'overpass' && onCameraMove && result.latitude && result.longitude) {
  const offset = { x: 0, y: 400 };
        try {
          setTimeout(() => onCameraMove && onCameraMove({ latitude: result.latitude, longitude: result.longitude }, offset), 80);
        } catch (e) {
        }
      }

      onSelectLocation(result);
      setIsExpanded(false);
      setSearchResults([]);
    },
    [onShowPOI, userLocation, onSelectLocation]
  );

  const handleShowRouteCallback = useCallback(
    (item: SearchResult) => {
      if (!onShowRoute) return;

      if (item.type !== "history") {
        RouteHistoryService.addToHistory({
          title: item.title,
          subtitle: item.subtitle,
          latitude: item.latitude,
          longitude: item.longitude,
        }).then(() => {
          loadHistory();
        });
      }

      onShowRoute(item);
      setIsExpanded(false);
      setSearchResults([]);
    },
    [onShowRoute]
  );

  const handleAddNavigationStopCallback = useCallback(
    (item: SearchResult) => {
      if (!onAddNavigationStop) return;

      if (item.type !== "history") {
        RouteHistoryService.addToHistory({
          title: item.title,
          subtitle: item.subtitle,
          latitude: item.latitude,
          longitude: item.longitude,
        }).then(() => {
          loadHistory();
        });
      }

      onAddNavigationStop(item);
      setIsExpanded(false);
      setSearchResults([]);
    },
    [onAddNavigationStop]
  );

  const handleAddStepCallback = useCallback(
    (item: SearchResult) => {
      if (!onAddStep) return;

      if (item.type !== "history") {
        RouteHistoryService.addToHistory({
          title: item.title,
          subtitle: item.subtitle,
          latitude: item.latitude,
          longitude: item.longitude,
        }).then(() => {
          loadHistory();
        });
      }

      onAddStep(item);
      setIsExpanded(false);
      setSearchResults([]);
    },
    [onAddStep]
  );

  const handleDeleteHistoryItemCallback = useCallback((id: string) => {
    RouteHistoryService.removeFromHistory(id).then(() => {
      loadHistory();
      setSearchResults((prev) => prev.filter((r) => r.id !== id));
    });
  }, []);

  const getCategoryEmoji = useCallback((type: AmenityType): string => {
    switch (type) {
      case "Sustenance":
        return "🍽️";
      case "Education":
        return "🎓";
      case "Transportation":
        return "🚗";
      case "Finance":
        return "💰";
      case "Healthcare":
        return "🏥";
      case "Entertainment":
        return "🎭";
      case "PublicService":
        return "🏛️";
      case "Facilities":
        return "🚻";
      case "Waste":
        return "🗑️";
      case "Other":
        return "📍";
      default:
        return "📍";
    }
  }, []);

  const getCategoryColor = useCallback((type: AmenityType): string => {
    switch (type) {
      case "Sustenance":
        return "#FF9500";
      case "Education":
        return "#007AFF";
      case "Transportation":
        return "#34C759";
      case "Finance":
        return "#FFD60A";
      case "Healthcare":
        return "#FF3B30";
      case "Entertainment":
        return "#AF52DE";
      case "PublicService":
        return "#5856D6";
      case "Facilities":
        return "#48CAE4";
      case "Waste":
        return "#8E8E93";
      case "Other":
        return "#FF6B6B";
      default:
        return "#666";
    }
  }, []);

  const getDisplayTitle = (result: NominatimSearchResult): string => {
    const address = result.address;

    if (address.city || address.town || address.village) {
      return address.city || address.town || address.village!;
    }

    if (address.road) {
      return address.road;
    }

    return result.display_name.split(",")[0];
  };

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsExpanded(false);
    }, 200);
  };

  const handleTextChange = (text: string) => {
    onChangeText(text);
    setShouldSearch(true);
  };

  const handleSearchPress = () => {
    Vibration.vibrate(50);

    if (searchMode === "address" && value.trim().length > 2) {
      performSearch(value);
    } else if (searchMode === "poi") {
      searchPOIs(value);
    }
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    Vibration.vibrate(50);

    if (result.amenityType?.startsWith("category_")) {
      return;
    }

    if (result.type === "overpass") {
      if (result.amenityType && onShowPOI && userLocation) {
        handlePOISearch(result.amenityType);
        setIsExpanded(false);
        setSearchResults([]);
        return;
      }
    }

    if (result.type !== "history") {
      RouteHistoryService.addToHistory({
        title: result.title,
        subtitle: result.subtitle,
        latitude: result.latitude,
        longitude: result.longitude,
      }).then(() => {
        loadHistory();
      });
    } else {
      RouteHistoryService.addToHistory({
        title: result.title,
        subtitle: result.subtitle,
        latitude: result.latitude,
        longitude: result.longitude,
      }).then(() => {
        loadHistory();
      });
    }

    onSelectLocation(result);
    setIsExpanded(false);
    setSearchResults([]);
  };

  const keyExtractor = useCallback((item: SearchResult) => item.id, []);

  const renderSearchResult = useCallback(
    ({ item }: { item: SearchResult }) => (
      <SearchResultItem
        item={item}
        onSelectResult={handleSelectResult}
        onShowRoute={onShowRoute ? handleShowRouteCallback : undefined}
        onAddNavigationStop={
          onAddNavigationStop ? handleAddNavigationStopCallback : undefined
        }
        onAddStep={onAddStep ? handleAddStepCallback : undefined}
  onToggleFavorite={handleToggleFavorite}
  isFavorite={(id: string) => favoriteIds.includes(id)}
        isNavigating={isNavigating}
        getCategoryColor={getCategoryColor}
        onDeleteHistoryItem={handleDeleteHistoryItemCallback}
      />
    ),
    [
      handleSelectResult,
      handleShowRouteCallback,
      handleAddNavigationStopCallback,
      handleAddStepCallback,
      isNavigating,
      getCategoryColor,
      handleDeleteHistoryItemCallback,
      onShowRoute,
      onAddNavigationStop,
      onAddStep,
    ]
  );

  const groupedCategories = React.useMemo(() => {
    const groups: Array<{ key: string; header: SearchResult; items: SearchResult[] }> = [];
    let current: { key: string; header: SearchResult; items: SearchResult[] } | null = null;

    (searchResults || []).forEach((item) => {
      if (item.amenityType && item.amenityType.startsWith('category_')) {
        current = { key: item.id, header: item, items: [] };
        groups.push(current);
      } else if (current) {
        current.items.push(item);
      }
    });

    return groups;
  }, [searchResults]);

  React.useEffect(() => {
    groupedCategories.forEach((group) => {
      const key = group.key;
      if (!animatedHeightsRef.current[key]) {
        animatedHeightsRef.current[key] = new Animated.Value(0);
      }
      if (!animatedRotationsRef.current[key]) {
        animatedRotationsRef.current[key] = new Animated.Value(0);
      }
      setExpandedCategories((prev) => (prev.hasOwnProperty(key) ? prev : { ...prev, [key]: false }));
    });
  }, [groupedCategories]);

  const toggleCategory = (key: string, itemCount: number) => {
    const isExpanded = !!expandedCategories[key];
    const rowHeight = 64;
    const contentHeight = itemCount * rowHeight;
    const heightAnim = animatedHeightsRef.current[key];
    const rotateAnim = animatedRotationsRef.current[key];
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

    setExpandedCategories((prev) => ({ ...prev, [key]: !isExpanded }));
  };

  return (
  <>
      {}
      {!isNavigating && (
        <View style={[
            styles.searchContainer,
            windowWidth > 700 ? { left: windowWidth * 0.12, right: windowWidth * 0.12, top: 32 } : {},
          ]}>
          {}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.searchInputTouchable}
            onPress={() => {
              setIsExpanded(true);
              setTimeout(() => {
                expandedInputRef.current?.focus();
              }, 60);
            }}
          >
            <Text style={styles.searchInputText} numberOfLines={1}>
              {value && value.length > 0 ? value : placeholder}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => setShowSettingsOverlay(true)}
          >
            <Icon name="settings" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      )}

  <SettingsOverlay visible={showSettingsOverlay} onClose={() => setShowSettingsOverlay(false)} onImportGpx={onImportGpx} />

      {}
      <Modal
        visible={isExpanded}
        animationType="slide"
        transparent={false}
        onRequestClose={handleClose}
      >
        <SafeAreaView style={styles.expandedContainer}>
          {}
          <View style={styles.expandedHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                Vibration.vibrate(50);
                handleClose();
              }}
            >
              <Icon name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>

            <View style={styles.headerInputRow}>
              <TextInput
                ref={(r) => (expandedInputRef.current = r)}
                style={styles.expandedInput}
                placeholder={placeholder}
                value={value}
                onChangeText={handleTextChange}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={handleSearchPress}
              />
              <TouchableOpacity
                style={styles.headerSearchButton}
                onPress={handleSearchPress}
                disabled={searchMode === "address" && value.trim().length <= 2}
              >
                <Icon
                  name="search"
                  size={20}
                  color={
                    searchMode === "poi" || value.trim().length > 2
                      ? "#007AFF"
                      : "#ccc"
                  }
                />
              </TouchableOpacity>
            </View>
          </View>

          {}
          <View style={styles.searchModes}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                searchMode === "address" && styles.modeButtonActive,
              ]}
              onPress={() => {
                Vibration.vibrate(50);
                setSearchMode("address");
              }}
            >
              <Icon
                name="place"
                size={20}
                color={searchMode === "address" ? "#fff" : "#666"}
              />
              <Text
                style={[
                  styles.modeText,
                  searchMode === "address" && styles.modeTextActive,
                ]}
              >
                Adresses
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                searchMode === "poi" && styles.modeButtonActive,
              ]}
              onPress={() => {
                Vibration.vibrate(50);
                setSearchMode("poi");
              }}
            >
              <Icon
                name="local-activity"
                size={20}
                color={searchMode === "poi" ? "#fff" : "#666"}
              />
              <Text
                style={[
                  styles.modeText,
                  searchMode === "poi" && styles.modeTextActive,
                ]}
              >
                POI
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                searchMode === "recent" && styles.modeButtonActive,
              ]}
              onPress={() => {
                Vibration.vibrate(50);
                setSearchMode("recent");
              }}
            >
              <Icon
                name="history"
                size={20}
                color={searchMode === "recent" ? "#fff" : "#666"}
              />
              <Text
                  style={[
                    styles.modeText,
                    searchMode === "recent" && styles.modeTextActive,
                  ]}
                >
                  Trajets récents
                </Text>
            </TouchableOpacity>
            {}
          </View>

          <View style={styles.quickPOIContainer}>
            <Text style={styles.quickPOITitle}>Trouver à proximité :</Text>
            <View style={styles.quickPOIButtons}>
              <TouchableOpacity
                style={styles.quickPOIButton}
                onPress={() => {
                  Vibration.vibrate(50);
                  if (onSearchNearbyPOI) onSearchNearbyPOI("fuel");
                  else if (onShowPOI) onShowPOI("fuel");
                  setIsExpanded(false);
                }}
              >
                <Icon name="local-gas-station" size={18} color="#FF6B6B" />
                <Text style={styles.quickPOIText}>Essence</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickPOIButton}
                onPress={() => {
                  Vibration.vibrate(50);
                  if (onSearchNearbyPOI) onSearchNearbyPOI("parking");
                  else if (onShowPOI) onShowPOI("parking");
                  setIsExpanded(false);
                }}
              >
                <Icon name="local-parking" size={18} color="#4ECDC4" />
                <Text style={styles.quickPOIText}>Parking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickPOIButton}
                onPress={() => {
                  Vibration.vibrate(50);
                  if (onSearchNearbyPOI) onSearchNearbyPOI("restaurant");
                  else if (onShowPOI) onShowPOI("restaurant");
                  setIsExpanded(false);
                }}
              >
                <Icon name="restaurant" size={18} color="#FFE66D" />
                <Text style={styles.quickPOIText}>Restaurant</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickPOIButton}
                onPress={() => {
                  Vibration.vibrate(50);
                  if (onSearchNearbyPOI) onSearchNearbyPOI("hospital");
                  else if (onShowPOI) onShowPOI("hospital");
                  setIsExpanded(false);
                }}
              >
                <Icon name="local-hospital" size={18} color="#FF9999" />
                <Text style={styles.quickPOIText}>Hôpital</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickPOIButton}
                onPress={() => {
                  Vibration.vibrate(50);
                  if (onSearchNearbyPOI) onSearchNearbyPOI("pharmacy");
                  else if (onShowPOI) onShowPOI("pharmacy");
                  setIsExpanded(false);
                }}
              >
                <Icon name="local-pharmacy" size={18} color="#4CAF50" />
                <Text style={styles.quickPOIText}>Pharmacie</Text>
              </TouchableOpacity>
            </View>
          </View>

          {}
          <Animated.View style={[styles.resultsContainer, {
            opacity: listAnim,
            transform: [{ translateY: listAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }]
          }]}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Recherche...</Text>
              </View>
            ) : (
              <FlatList
                data={
                  searchMode === "poi"
                    ? searchResults
                    : searchMode === "recent"
                    ? historyItems
                    : value.trim().length > 2
                    ? searchResults
                    : []
                }
                renderItem={renderSearchResult}
                keyExtractor={keyExtractor}
                style={styles.resultsList}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                updateCellsBatchingPeriod={50}
                initialNumToRender={15}
                windowSize={5}
                getItemLayout={undefined}
                ListHeaderComponent={
                  searchMode === "recent" ? (
                    <View style={styles.historyHeader}>
                      <Icon name="history" size={16} color="#666" />
                      <Text style={styles.historyHeaderText}>
                        Trajets récents
                      </Text>
                      {historyItems.length > 0 && (
                        <TouchableOpacity
                          style={styles.clearHistoryButton}
                          onPress={() => {
                            RouteHistoryService.clearHistory().then(() => {
                              loadHistory();
                            });
                          }}
                        >
                          <Text style={styles.clearHistoryText}>Effacer</Text>
                        </TouchableOpacity>
                      )}
                      {}
                      <TouchableOpacity
                        style={[styles.clearHistoryButton, { marginLeft: 8, backgroundColor: '#28A745' }]}
                        onPress={() => {
                          if (typeof onResumeLastTrip === 'function') onResumeLastTrip();
                        }}
                      >
                        <Text style={styles.clearHistoryText}>Reprendre le dernier itinéraire</Text>
                      </TouchableOpacity>
                    </View>
                  ) : searchMode === "poi" && value.trim().length === 0 ? (
                    <View style={styles.historyHeader}>
                      <Icon name="local-activity" size={16} color="#9C27B0" />
                      <Text style={styles.historyHeaderText}>
                        Points d'intérêt disponibles
                      </Text>
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  searchMode === "address" && value.trim().length > 2 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>
                        Aucun résultat trouvé
                      </Text>
                    </View>
                  ) : searchMode === "address" ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>
                        {historyItems.length === 0
                          ? "Recherchez un lieu pour commencer..."
                          : "Tapez au moins 3 caractères pour rechercher"}
                      </Text>
                    </View>
                  ) : searchMode === "poi" && searchResults.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>
                        Aucun point d'intérêt trouvé
                      </Text>
                    </View>
                  ) : null
                }
              />
            )}
          </Animated.View>
          {}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  searchContainer: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInputTouchable: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    justifyContent: 'center',
  },
  searchInputText: {
    color: '#666',
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  searchButton: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    marginLeft: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  expandedContainer: {
    flex: 1,
    backgroundColor: "white",
  },
  expandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    marginRight: 16,
  },
  expandedInput: {
    flex: 1,
    fontSize: 16,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  searchModes: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    gap: 8,
  },
  modeButtonActive: {
    backgroundColor: "#007AFF",
  },
  modeText: {
    color: "#666",
    fontWeight: "500",
  },
  modeTextActive: {
    color: "white",
  },
  manualSearchButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    marginLeft: "auto",
  },
  resultsContainer: {
    flex: 1,
  },
  resultsList: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  historyHeaderText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginLeft: 8,
    flex: 1,
  },
  clearHistoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#DC3545",
  },
  clearHistoryText: {
    fontSize: 12,
    fontWeight: "500",
    color: "white",
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  resultContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  resultIcon: {
    marginRight: 12,
  },
  resultText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  searchCountBadge: {
    backgroundColor: "#FF9500",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 20,
    alignItems: "center",
  },
  searchCountText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  routeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F0F8FF",
    marginLeft: 8,
  },
  addStepButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F0FFF0",
    marginLeft: 4,
  },
  navigationStopButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FFF8E7",
    marginLeft: 4,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#F5F5F5",
    marginLeft: 4,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  resultSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  loadingText: {
    color: "#666",
    fontSize: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
  },
  categoryHeader: {
    backgroundColor: "#F8F9FA",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  categorySubtitle: {
    fontSize: 12,
    color: "#666",
  },
  quickPOIContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  quickPOITitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  quickPOIButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickPOIButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "white",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    gap: 6,
  },
  quickPOIText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#333",
  },
  favoriteButton: {
    padding: 8,
    marginLeft: 6,
  },
  headerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  headerSearchButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    elevation: 2,
  },
});


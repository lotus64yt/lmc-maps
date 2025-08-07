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
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import {
  NominatimService,
  NominatimSearchResult,
} from "../services/NominatimService";
import {
  RouteHistoryService,
  HistoryItem,
} from "../services/RouteHistoryService";
import { OverpassService, OverpassPOI } from "../services/OverpassService";
import OverPassAmenityList, {
  AmenityType,
} from "../assets/overpass/amenityList";

// Composant optimisé pour les éléments de la liste
const SearchResultItem = memo(({ 
  item, 
  onSelectResult, 
  onShowRoute, 
  onAddNavigationStop, 
  onAddStep, 
  isNavigating,
  getCategoryColor,
  onDeleteHistoryItem 
}: {
  item: SearchResult;
  onSelectResult: (result: SearchResult) => void;
  onShowRoute?: (result: SearchResult) => void;
  onAddNavigationStop?: (result: SearchResult) => void;
  onAddStep?: (result: SearchResult) => void;
  isNavigating: boolean;
  getCategoryColor: (type: AmenityType) => string;
  onDeleteHistoryItem: (id: string) => void;
}) => {
  // Si c'est un en-tête de catégorie
  if (item.amenityType?.startsWith("category_")) {
    const categoryType = item.amenityType.replace("category_", "") as AmenityType;
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

  // Rendu normal pour les autres éléments
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
        {(item.type === "nominatim" || item.type === "history") &&
          onShowRoute &&
          !isNavigating && (
            <TouchableOpacity
              style={styles.routeButton}
              onPress={() => onShowRoute(item)}
            >
              <Icon name="directions" size={20} color="#007AFF" />
            </TouchableOpacity>
          )}
        {/* Bouton pour ajouter un arrêt pendant la navigation */}
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
      </View>
    </TouchableOpacity>
  );
});

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  type: "nominatim" | "overpass" | "history";
  searchCount?: number;
  amenityType?: string; // Pour les POI Overpass
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
  autoExpand?: boolean; // Nouveau prop pour auto-expansion
  onClose?: () => void; // Nouveau prop pour fermer le modal
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
}: ExpandableSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<"address" | "poi">("address");
  const [shouldSearch, setShouldSearch] = useState(false);
  const [historyItems, setHistoryItems] = useState<SearchResult[]>([]);
  const searchTimeout = useRef<NodeJS.Timeout>();

  // Animation pour l'expansion
  const expandAnim = useRef(new Animated.Value(0)).current;

  // Charger l'historique au démarrage
  useEffect(() => {
    loadHistory();
  }, [userLocation]);

  // Fonction pour charger l'historique
  const loadHistory = async () => {
    try {
      const history = await RouteHistoryService.getHistory();

      // Filtrer par zone géographique si on a la position utilisateur
      const filteredHistory = userLocation
        ? RouteHistoryService.filterByLocation(
            history,
            userLocation.latitude,
            userLocation.longitude,
            100 // Rayon de 100km
          )
        : history.slice(0, 5); // Sinon, prendre les 5 premiers

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
      console.error("Erreur lors du chargement de l'historique:", error);
    }
  };

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  // Auto-expansion si demandée (pour le mode navigation)
  useEffect(() => {
    if (autoExpand && !isExpanded) {
      setIsExpanded(true);
    }
  }, [autoExpand]);

  // Fonction centralisée pour fermer le modal
  const handleClose = () => {
    setIsExpanded(false);
    if (onClose) {
      onClose();
    }
  };

  // Fonction pour détecter si le texte contient des coordonnées
  const detectCoordinates = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Patterns pour différents formats de coordonnées
    const patterns = [
      // DD: 45.123456, -74.123456 ou 45.123456,-74.123456
      /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)\s*,\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/,
      // DD avec espaces: 45.123456 -74.123456
      /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)\s+[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/,
      // DMS: 45°7'22.032"N 74°7'22.032"W
      /^\d{1,3}°\d{1,2}['′]\d{1,2}(\.\d+)?["″][NS]\s*\d{1,3}°\d{1,2}['′]\d{1,2}(\.\d+)?["″][EW]$/i,
      // DMM: 45°7.3672'N 74°7.3672'W
      /^\d{1,3}°\d{1,2}\.\d+['′][NS]\s*\d{1,3}°\d{1,2}\.\d+['′][EW]$/i,
    ];

    return patterns.some((pattern) => pattern.test(trimmed));
  };

  // Fonction pour parser les coordonnées depuis différents formats
  const parseCoordinates = (
    text: string
  ): { latitude: number; longitude: number } | null => {
    const trimmed = text.trim();

    // Format DD simple: lat, lon
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

  // Recherche avec debounce plus long - se déclenche seulement quand l'utilisateur arrête d'écrire
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    // Vérifier si le texte contient des coordonnées
    if (isExpanded && searchMode === "address" && value.trim().length > 0) {
      const isCoordinates = detectCoordinates(value);

      if (isCoordinates) {
        // Si c'est des coordonnées, ne pas faire d'appel API et proposer "Aller à ce point"
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
      }, 1500); // Augmenté à 1.5 secondes
    } else if (isExpanded && searchMode === "poi") {
      // Pour les POI, rechercher immédiatement même avec un champ vide
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
      console.error("Erreur de recherche:", error);
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

    // Combiner l'historique et les nouveaux résultats
    const combinedResults = [...historyItems, ...formattedResults];

    // Filtrer les doublons (même coordonnées)
    const uniqueResults = combinedResults.filter((item, index, arr) => {
      return (
        arr.findIndex(
          (other) =>
            Math.abs(other.latitude - item.latitude) < 0.0001 &&
            Math.abs(other.longitude - item.longitude) < 0.0001
        ) === index
      );
    });

    // Trier : historique en premier (par searchCount), puis nouveaux résultats
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

  // Fonction pour normaliser le texte (supprimer les accents et mettre en minuscules)
  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Supprimer les accents
  };

  const searchPOIs = async (query: string) => {
    const normalizedQuery = normalizeText(query.trim());

    // Si la requête est vide, afficher tous les amenities
    let matchingAmenities = OverPassAmenityList;

    // Si il y a une requête, filtrer les amenities
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

    // Grouper par catégorie
    const groupedByType = matchingAmenities.reduce((acc, amenity) => {
      if (!acc[amenity.type]) {
        acc[amenity.type] = [];
      }
      acc[amenity.type].push(amenity);
      return acc;
    }, {} as Record<AmenityType, typeof matchingAmenities>);

    // Créer les résultats avec headers de catégorie
    const poiResults: SearchResult[] = [];

    // Ordre des catégories
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
      "Other"
    ];

    categoryOrder.forEach((category) => {
      if (groupedByType[category] && groupedByType[category].length > 0) {
        // Ajouter l'en-tête de catégorie
        poiResults.push({
          id: `category_${category}`,
          title: getCategoryEmoji(category) + " " + category,
          subtitle: `${groupedByType[category].length} options disponibles`,
          latitude: 0,
          longitude: 0,
          type: "overpass",
          amenityType: `category_${category}`,
        });

        // Ajouter les amenities de cette catégorie
        groupedByType[category].forEach((amenity, index) => {
          poiResults.push({
            id: `poi_${amenity.value}_${index}`,
            title: `${getCategoryEmoji(amenity.type)} ${amenity.label}`,
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

  // Fonction pour rechercher les POI via l'API et les passer au drawer
  const handlePOISearch = async (amenityType: string) => {
    if (!userLocation || !onShowPOI) return;

    try {
      const results = await OverpassService.searchPOI(
        userLocation.latitude,
        userLocation.longitude,
        5000, // Rayon fixe de 5km
        amenityType
      );

      // Passer les résultats au POIDrawer
      onShowPOI(amenityType, results);
    } catch (error) {
      console.error("Erreur lors de la recherche POI:", error);
      // En cas d'erreur, ouvrir le drawer sans POI pré-chargés
      onShowPOI(amenityType);
    }
  };

  // Callbacks mémorisés pour optimiser les performances
  const handleSelectResultCallback = useCallback((result: SearchResult) => {
    Vibration.vibrate(50);

    // Ignorer les clics sur les en-têtes de catégorie
    if (result.amenityType?.startsWith("category_")) {
      return;
    }

    if (result.type === "overpass") {
      // Pour les POI Overpass, faire d'abord la recherche puis ouvrir le POIDrawer
      if (result.amenityType && onShowPOI && userLocation) {
        // Faire la recherche POI avant d'ouvrir le drawer
        handlePOISearch(result.amenityType);
        setIsExpanded(false);
        setSearchResults([]);
        return;
      }
    }

    // Ajouter à l'historique si ce n'est pas déjà un élément d'historique
    if (result.type !== "history") {
      RouteHistoryService.addToHistory({
        title: result.title,
        subtitle: result.subtitle,
        latitude: result.latitude,
        longitude: result.longitude,
      }).then(() => {
        loadHistory(); // Recharger l'historique
      });
    } else {
      // Si c'est un élément d'historique, l'incrémenter
      RouteHistoryService.addToHistory({
        title: result.title,
        subtitle: result.subtitle,
        latitude: result.latitude,
        longitude: result.longitude,
      }).then(() => {
        loadHistory(); // Recharger l'historique
      });
    }

    onSelectLocation(result);
    setIsExpanded(false);
    setSearchResults([]);
  }, [onShowPOI, userLocation, onSelectLocation]);

  const handleShowRouteCallback = useCallback((item: SearchResult) => {
    if (!onShowRoute) return;
    
    // Ajouter à l'historique même quand on utilise le bouton route
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
  }, [onShowRoute]);

  const handleAddNavigationStopCallback = useCallback((item: SearchResult) => {
    if (!onAddNavigationStop) return;
    
    // Ajouter à l'historique si ce n'est pas déjà fait
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
  }, [onAddNavigationStop]);

  const handleAddStepCallback = useCallback((item: SearchResult) => {
    if (!onAddStep) return;
    
    // Ajouter à l'historique si ce n'est pas déjà fait
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
  }, [onAddStep]);

  const handleDeleteHistoryItemCallback = useCallback((id: string) => {
    RouteHistoryService.removeFromHistory(id).then(() => {
      loadHistory();
      // Mettre à jour la liste actuelle si elle contient cet élément
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
        return "#FF9500"; // Orange
      case "Education":
        return "#007AFF"; // Bleu
      case "Transportation":
        return "#34C759"; // Vert
      case "Finance":
        return "#FFD60A"; // Jaune doré
      case "Healthcare":
        return "#FF3B30"; // Rouge
      case "Entertainment":
        return "#AF52DE"; // Violet
      case "PublicService":
        return "#5856D6"; // Indigo
      case "Facilities":
        return "#48CAE4"; // Bleu clair
      case "Waste":
        return "#8E8E93"; // Gris
      case "Other":
        return "#FF6B6B"; // Rose
      default:
        return "#666";
    }
  }, []);

  const getDisplayTitle = (result: NominatimSearchResult): string => {
    const address = result.address;

    // Priorité : nom de lieu > route > ville
    if (address.city || address.town || address.village) {
      return address.city || address.town || address.village!;
    }

    if (address.road) {
      return address.road;
    }

    // Fallback sur le display_name tronqué
    return result.display_name.split(",")[0];
  };

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleBlur = () => {
    // Délai pour permettre la sélection d'un résultat
    setTimeout(() => {
      setIsExpanded(false);
    }, 200);
  };

  const handleTextChange = (text: string) => {
    onChangeText(text);
    setShouldSearch(true); // Marquer qu'une recherche est demandée
  };

  const handleSearchPress = () => {
    Vibration.vibrate(50);

    if (searchMode === "address" && value.trim().length > 2) {
      performSearch(value);
    } else if (searchMode === "poi") {
      // Pour les POI, toujours effectuer la recherche
      searchPOIs(value);
    }
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    Vibration.vibrate(50);

    // Ignorer les clics sur les en-têtes de catégorie
    if (result.amenityType?.startsWith("category_")) {
      return;
    }

    if (result.type === "overpass") {
      // Pour les POI Overpass, faire d'abord la recherche puis ouvrir le POIDrawer
      if (result.amenityType && onShowPOI && userLocation) {
        // Faire la recherche POI avant d'ouvrir le drawer
        handlePOISearch(result.amenityType);
        setIsExpanded(false);
        setSearchResults([]);
        return;
      }
    }

    // Ajouter à l'historique si ce n'est pas déjà un élément d'historique
    if (result.type !== "history") {
      RouteHistoryService.addToHistory({
        title: result.title,
        subtitle: result.subtitle,
        latitude: result.latitude,
        longitude: result.longitude,
      }).then(() => {
        loadHistory(); // Recharger l'historique
      });
    } else {
      // Si c'est un élément d'historique, l'incrémenter
      RouteHistoryService.addToHistory({
        title: result.title,
        subtitle: result.subtitle,
        latitude: result.latitude,
        longitude: result.longitude,
      }).then(() => {
        loadHistory(); // Recharger l'historique
      });
    }

    onSelectLocation(result);
    setIsExpanded(false);
    setSearchResults([]);
  };

  // Fonction pour extraire la clé d'un élément
  const keyExtractor = useCallback((item: SearchResult) => item.id, []);

  const renderSearchResult = useCallback(
    ({ item }: { item: SearchResult }) => (
      <SearchResultItem
        item={item}
        onSelectResult={handleSelectResult}
        onShowRoute={onShowRoute ? handleShowRouteCallback : undefined}
        onAddNavigationStop={onAddNavigationStop ? handleAddNavigationStopCallback : undefined}
        onAddStep={onAddStep ? handleAddStepCallback : undefined}
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

  return (
    <>
      {/* Barre de recherche normale */}
      {!isNavigating && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            value={""}
            onChangeText={handleTextChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearchPress}
          >
            <Icon name="search" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de recherche expandée */}
      <Modal
        visible={isExpanded}
        animationType="slide"
        transparent={false}
        onRequestClose={handleClose}
      >
        <SafeAreaView style={styles.expandedContainer}>
          {/* Header avec barre de recherche */}
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

            <TextInput
              style={styles.expandedInput}
              placeholder={placeholder}
              value={value}
              onChangeText={handleTextChange}
              autoFocus
            />
          </View>

          {/* Modes de recherche */}
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
                POI (Overpass)
              </Text>
            </TouchableOpacity>

            {/* Bouton de recherche manuelle */}
            <TouchableOpacity
              style={styles.manualSearchButton}
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

          {/* Boutons rapides POI pendant la navigation */}
          {isNavigating && onSearchNearbyPOI && (
            <View style={styles.quickPOIContainer}>
              <Text style={styles.quickPOITitle}>Trouver à proximité :</Text>
              <View style={styles.quickPOIButtons}>
                <TouchableOpacity
                  style={styles.quickPOIButton}
                  onPress={() => {
                    Vibration.vibrate(50);
                    onSearchNearbyPOI("fuel");
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
                    onSearchNearbyPOI("parking");
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
                    onSearchNearbyPOI("restaurant");
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
                    onSearchNearbyPOI("hospital");
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
                    onSearchNearbyPOI("pharmacy");
                    setIsExpanded(false);
                  }}
                >
                  <Icon name="local-pharmacy" size={18} color="#4CAF50" />
                  <Text style={styles.quickPOIText}>Pharmacie</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Résultats */}
          <View style={styles.resultsContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Recherche...</Text>
              </View>
            ) : (
              <FlatList
                data={
                  searchMode === "poi"
                    ? searchResults
                    : value.trim().length > 2
                    ? searchResults
                    : historyItems
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
                  searchMode === "address" &&
                  value.trim().length <= 2 &&
                  historyItems.length > 0 ? (
                    <View style={styles.historyHeader}>
                      <Icon name="history" size={16} color="#666" />
                      <Text style={styles.historyHeaderText}>
                        Recherches récentes
                      </Text>
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
          </View>
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
    paddingHorizontal: 16,
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
});

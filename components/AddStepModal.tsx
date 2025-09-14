import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  FlatList,
  StyleSheet,
} from 'react-native';
import { NominatimService } from '../services/NominatimService';

export default function AddStepModal({
  visible,
  initialQuery,
  onCancel,
  onSelect,
}: {
  visible: boolean;
  initialQuery?: string;
  onCancel: () => void;
  onSelect: (result: any) => void;
}) {
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query || query.trim().length === 0) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await NominatimService.search(query, { limit: 12 });
        setResults(
          res.map((r: any) => ({
            id: String(r.place_id),
            title: r.display_name.split(',')[0],
            subtitle: r.display_name,
            latitude: parseFloat(r.lat),
            longitude: parseFloat(r.lon),
            type: 'nominatim',
          }))
        );
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <Modal animationType="none" transparent visible={visible} onRequestClose={onCancel}>
      <View style={localStyles.backdrop}>
        <Animated.View style={[localStyles.container, { transform: [{ translateY }] }]}>
          <Text style={localStyles.title}>Ajouter une étape</Text>
          <TextInput
            style={localStyles.input}
            placeholder="Rechercher adresse ou POI..."
            value={query}
            onChangeText={setQuery}
            autoFocus
          />

          {loading ? (
            <Text style={localStyles.loading}>Recherche...</Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={localStyles.item}
                  onPress={() => onSelect(item)}
                >
                  <Text style={localStyles.itemTitle}>{item.title}</Text>
                  <Text style={localStyles.itemSubtitle}>{item.subtitle}</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={localStyles.closeButton} onPress={onCancel}>
            <Text style={localStyles.closeText}>Fermer</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  container: { backgroundColor: 'white', maxHeight: '70%', padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#e6e6e6', borderRadius: 8, padding: 8, marginBottom: 12 },
  loading: { padding: 8, color: '#666' },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  itemTitle: { fontWeight: '600' },
  itemSubtitle: { color: '#666' },
  closeButton: { marginTop: 12, alignSelf: 'flex-end' },
  closeText: { color: '#007AFF', fontWeight: '600' },
});


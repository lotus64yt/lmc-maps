import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FavoritesService, FavoriteItem } from '../services/FavoritesService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect?: (item: FavoriteItem) => void;
}

export default function FavoritesDrawer({ visible, onClose, onSelect }: Props) {
  const [items, setItems] = useState<FavoriteItem[]>([]);

  const load = async () => {
    const favs = await FavoritesService.listFavorites();
    setItems(favs);
  };

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const handleRemove = async (id: string) => {
    await FavoritesService.removeFavorite(id);
    await load();
  };

  const renderItem = ({ item }: { item: FavoriteItem }) => (
    <TouchableOpacity style={styles.row} onPress={() => onSelect && onSelect(item)}>
      <View style={styles.rowLeft}>
        <Text style={styles.title}>{item.title}</Text>
        {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        <TouchableOpacity onPress={() => handleRemove(item.id)} style={styles.iconButton}>
          <MaterialIcons name="delete" size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Favoris</Text>
            <TouchableOpacity onPress={onClose}><MaterialIcons name="close" size={24} color="#333" /></TouchableOpacity>
          </View>
          <View style={styles.listContainer}>
            <FlatList data={items} keyExtractor={(i) => i.id} renderItem={renderItem} />
            {items.length === 0 && (
              <View style={styles.empty}><Text style={styles.emptyText}>Aucun favori pour le moment</Text></View>
            )}
            {}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  container: { backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  listContainer: { paddingHorizontal: 16, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f4f4f4' },
  rowLeft: { flex: 1 },
  rowRight: { marginLeft: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  iconButton: { padding: 6 },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#999' },
  
});


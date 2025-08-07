import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

const TRANSPORTS = [
  { id: 'driving', name: 'Voiture', icon: 'directions-car' },
  { id: 'walking', name: 'À pied', icon: 'directions-walk' },
  { id: 'bicycling', name: 'Vélo', icon: 'directions-bike' },
  { id: 'transit', name: 'Transport', icon: 'directions-transit' },
];

export default function ResumeTripModal({
  visible,
  destination,
  mode,
  onValidate,
  onCancel
}: {
  visible: boolean;
  destination: { name?: string };
  mode: string;
  onValidate: (mode: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(mode);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Allons-nous toujours à {destination?.name || 'votre destination'} en {TRANSPORTS.find(t => t.id === selected)?.name} ?</Text>
          <View style={styles.selectContainer}>
            {TRANSPORTS.map(t => (
              <TouchableOpacity key={t.id} style={[styles.selectItem, selected === t.id && styles.selected]} onPress={() => setSelected(t.id)}>
                <Icon name={t.icon as any} size={22} color={selected === t.id ? '#007AFF' : '#888'} />
                <Text style={[styles.selectText, selected === t.id && { color: '#007AFF', fontWeight: 'bold' }]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Annuler mon trajet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.goBtn} onPress={() => onValidate(selected)}>
              <Text style={styles.goText}>Y aller</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: 'white', borderRadius: 16, padding: 24, width: 320, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 18, textAlign: 'center' },
  selectContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 18 },
  selectItem: { flexDirection: 'column', alignItems: 'center', marginHorizontal: 10, padding: 8, borderRadius: 8 },
  selected: { backgroundColor: '#EAF2FF' },
  selectText: { marginTop: 4, fontSize: 13, color: '#888' },
  buttonRow: { flexDirection: 'row', marginTop: 10 },
  cancelBtn: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 8, padding: 12, marginRight: 8, alignItems: 'center' },
  goBtn: { flex: 1, backgroundColor: '#007AFF', borderRadius: 8, padding: 12, marginLeft: 8, alignItems: 'center' },
  cancelText: { color: '#333', fontWeight: '500', fontSize: 15 },
  goText: { color: 'white', fontWeight: '600', fontSize: 15 },
});

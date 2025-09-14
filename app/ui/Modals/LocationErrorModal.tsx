import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  onClose: () => void;
  styles: any;
};

export default function LocationErrorModal({ visible, onClose, styles }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <MaterialIcons name="location-off" size={32} color="#FF3B30" />
            <Text style={styles.modalTitle}>Problème de localisation</Text>
          </View>
          <Text style={styles.modalDescription}>
            Impossible de récupérer votre position actuelle. Vérifiez que les services de localisation sont activés et que l'application a l'autorisation d'accéder à la localisation.
          </Text>
          <View style={styles.modalButtonsVertical}>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={onClose}>
              <MaterialIcons name="close" size={20} color="#FFF" />
              <Text style={styles.modalButtonTextPrimary}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

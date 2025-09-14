import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LABS_KEY = 'labs_mode_enabled';
const LABS_UNLOCKED_KEY = 'labs_mode_unlocked';
const LABS_SHOW_DEBUG_KEY = 'labs_show_debug_info';

interface LabsContextType {
  labsMode: boolean;
  setLabsMode: (v: boolean) => Promise<void>;
  labsUnlocked: boolean;
  unlockLabs: () => Promise<void>;
  showDebugInfo: boolean;
  setShowDebugInfo: (v: boolean) => Promise<void>;
}

const LabsContext = createContext<LabsContextType | undefined>(undefined);

export const LabsProvider = ({ children }: { children: ReactNode }) => {
  const [labsMode, setLabsModeState] = useState(false);
  const [labsUnlocked, setLabsUnlocked] = useState(false);
  const [showDebugInfo, setShowDebugInfoState] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(LABS_KEY);
        const unlocked = await AsyncStorage.getItem(LABS_UNLOCKED_KEY);
  const showDebug = await AsyncStorage.getItem(LABS_SHOW_DEBUG_KEY);
        if (v === 'true') setLabsModeState(true);
        if (unlocked === 'true') setLabsUnlocked(true);
  if (showDebug === 'true') setShowDebugInfoState(true);
      } catch (e) {
      }
    })();
  }, []);

  const setLabsMode = async (v: boolean) => {
    try {
      await AsyncStorage.setItem(LABS_KEY, v ? 'true' : 'false');
      if (v) {
        await AsyncStorage.setItem(LABS_UNLOCKED_KEY, 'true');
        setLabsUnlocked(true);
      }
    } catch (e) {
    }
    setLabsModeState(v);
  };

  const unlockLabs = async () => {
    try {
      await AsyncStorage.setItem(LABS_UNLOCKED_KEY, 'true');
      setLabsUnlocked(true);
    } catch (e) {
    }
  };

  const setShowDebugInfo = async (v: boolean) => {
    try {
      await AsyncStorage.setItem(LABS_SHOW_DEBUG_KEY, v ? 'true' : 'false');
    } catch (e) {
    }
    setShowDebugInfoState(v);
  };

  return (
    <LabsContext.Provider value={{ labsMode, setLabsMode, labsUnlocked, unlockLabs, showDebugInfo, setShowDebugInfo }}>
      {children}
    </LabsContext.Provider>
  );
};

export function useLabs() {
  const ctx = useContext(LabsContext);
  if (!ctx) throw new Error('useLabs must be used within LabsProvider');
  return ctx;
}

export default LabsContext;


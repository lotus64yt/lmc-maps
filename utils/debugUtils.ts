/**
 * Debug utility for conditional logging
 * Set DEBUG_MODE to false for production builds
 */

const DEBUG_MODE = __DEV__; // Uses React Native's __DEV__ flag

export const debugLog = {
  info: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },
  
  error: (message: string, ...args: any[]) => {
    // Always log errors, even in production
    console.error(`[ERROR] ${message}`, ...args);
  },
  
  poi: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      console.log(`📍 [POI] ${message}`, ...args);
    }
  },
  
  safety: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      console.log(`🛡️ [SAFETY] ${message}`, ...args);
    }
  },
  
  camera: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      console.log(`📷 [CAMERA] ${message}`, ...args);
    }
  }
};

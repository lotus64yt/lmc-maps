const DEBUG_MODE = __DEV__;

export const debugLog = {
  info: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      // console.log(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  poi: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      // console.log(`📍 [POI] ${message}`, ...args);
    }
  },
  safety: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      // console.log(`🛡️ [SAFETY] ${message}`, ...args);
    }
  },
  camera: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) {
      // console.log(`📷 [CAMERA] ${message}`, ...args);
    }
  },
};

export const debug = {
  info: (...args: any[]) => {},
  poi: (...args: any[]) => {},
  safety: (...args: any[]) => {},
  camera: (...args: any[]) => {},
};

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "app_theme";

interface ThemeState {
  isDark: boolean;
  setDark: (isDark: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: true,
  setDark: (isDark) => {
    set({ isDark });
    AsyncStorage.setItem(THEME_KEY, isDark ? "dark" : "light").catch(() => {});
  },
  hydrate: async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved !== null) set({ isDark: saved === "dark" });
    } catch {
      // AsyncStorage native module unavailable (Expo Go) - use default
    }
  },
}));

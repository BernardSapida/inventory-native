import { useThemeStore } from "@/store/theme";

export const DARK = {
  bg: "#12151C",
  surface: "#1C2030",
  surfaceAlt: "#252A3A",
  brand: "#22C55E",
  brandSoft: "rgba(34,197,94,0.12)",
  text: "#FFFFFF",
  textSec: "#8A90A2",
  border: "#2A3045",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,0.12)",
  warning: "#F59E0B",
  warningSoft: "rgba(245,158,11,0.12)",
  danger: "#EF4444",
  dangerSoft: "rgba(239,68,68,0.12)",
  info: "#3B82F6",
  infoSoft: "rgba(59,130,246,0.12)",
} as const;

export const LIGHT = {
  bg: "#F5F6FA",
  surface: "#FFFFFF",
  surfaceAlt: "#ECEEF4",
  brand: "#22C55E",
  brandSoft: "rgba(34,197,94,0.12)",
  text: "#0F1117",
  textSec: "#6B7280",
  border: "#DDE1EB",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,0.12)",
  warning: "#F59E0B",
  warningSoft: "rgba(245,158,11,0.12)",
  danger: "#EF4444",
  dangerSoft: "rgba(239,68,68,0.12)",
  info: "#3B82F6",
  infoSoft: "rgba(59,130,246,0.12)",
} as const;

export type ColorPalette = typeof DARK;

export function useColors(): ColorPalette {
  const isDark = useThemeStore((s) => s.isDark);
  return isDark ? DARK : LIGHT;
}

// Static dark default - used only for StyleSheet.create() calls outside components.
// Always prefer useColors() inside component functions.
export const C = DARK;

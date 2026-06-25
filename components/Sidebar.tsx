import BrandIcon from "@/components/BrandIcon";
import { C, useColors } from "@/lib/constants";
import { signOut } from "@/lib/firebase/auth";
import { useSidebar } from "@/lib/sidebar";
import { useAuthStore } from "@/store/auth";
import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SIDEBAR_WIDTH = 280;

interface NavItem {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  match: string; // pathname segment to match for active state
}

const STAFF_ITEMS: NavItem[] = [
  { label: "Home", icon: "home", route: "/(staff)/", match: "index" },
  {
    label: "Inventory",
    icon: "package",
    route: "/(staff)/inventory",
    match: "inventory",
  },
  {
    label: "Recipes",
    icon: "book-open",
    route: "/(staff)/recipes",
    match: "recipes",
  },
  {
    label: "Inspect",
    icon: "clipboard",
    route: "/(staff)/inspection",
    match: "inspection",
  },
  {
    label: "Alerts",
    icon: "alert-triangle",
    route: "/(staff)/alerts",
    match: "alerts",
  },
  {
    label: "Notifications",
    icon: "bell",
    route: "/(staff)/notifications",
    match: "notifications",
  },
  {
    label: "Forecast",
    icon: "trending-up",
    route: "/(staff)/forecasting",
    match: "forecasting",
  },
  {
    label: "Profile",
    icon: "user",
    route: "/(staff)/profile",
    match: "profile",
  },
];

const ADMIN_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    icon: "grid",
    route: "/(admin)/",
    match: "index",
  },
  {
    label: "Inventory",
    icon: "package",
    route: "/(admin)/inventory",
    match: "inventory",
  },
  {
    label: "Recipes",
    icon: "book-open",
    route: "/(admin)/recipes",
    match: "recipes",
  },
  {
    label: "Forecast",
    icon: "trending-up",
    route: "/(admin)/forecasting",
    match: "forecasting",
  },
  {
    label: "Alerts",
    icon: "alert-triangle",
    route: "/(admin)/alerts",
    match: "alerts",
  },
  {
    label: "Notifications",
    icon: "bell",
    route: "/(admin)/notifications",
    match: "notifications",
  },
  {
    label: "Profile",
    icon: "user",
    route: "/(admin)/profile",
    match: "profile",
  },
];

interface Props {
  role: "staff" | "admin";
}

export default function Sidebar({ role }: Props) {
  const { isOpen, close } = useSidebar();
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();

  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const items = role === "staff" ? STAFF_ITEMS : ADMIN_ITEMS;

  function isActive(item: NavItem): boolean {
    // Home/Dashboard live at the group root, which expo-router exposes as "/"
    if (item.match === "index") {
      return pathname === "/";
    }
    return pathname.includes(item.match);
  }

  function navigate(route: string) {
    close();
    setTimeout(() => router.navigate(route as never), 120);
  }

  async function handleSignOut() {
    close();
    await signOut();
  }

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  // Pointer events: when closed, nothing in the sidebar should intercept touches
  const pointerEvents = isOpen ? "auto" : "none";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={pointerEvents}>
      {/* Dim overlay */}
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Sidebar panel */}
      <Animated.View
        style={[
          styles.panel,
          {
            backgroundColor: palette.surface,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Header: brand + close button */}
        <View style={styles.panelHeader}>
          <View style={styles.brandRow}>
            <BrandIcon size={30} />
            <Text style={[styles.appName, { color: palette.text }]}>
              SmartStock
            </Text>
          </View>
          <TouchableOpacity
            onPress={close}
            style={[
              styles.closeBtn,
              {
                backgroundColor: palette.surfaceAlt,
                borderColor: palette.border,
              },
            ]}
          >
            <Feather name="x" size={18} color={palette.textSec} />
          </TouchableOpacity>
        </View>

        {/* User info */}
        <View style={[styles.userRow, { borderColor: palette.border }]}>
          <View style={[styles.avatar, { backgroundColor: C.brand + "22" }]}>
            <Text style={[styles.avatarText, { color: C.brand }]}>
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.userName, { color: palette.text }]}
              numberOfLines={1}
            >
              {user?.fullName ?? "-"}
            </Text>
            <Text style={[styles.userRole, { color: palette.textSec }]}>
              {user?.role ?? ""}
            </Text>
          </View>
        </View>

        {/* Nav items */}
        <View style={styles.navList}>
          {items.map((item) => {
            const active = isActive(item);
            return (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.navItem,
                  { borderRadius: 12 },
                  active && { backgroundColor: C.brand + "18" },
                ]}
                onPress={() => navigate(item.route)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.navIcon,
                    active && { backgroundColor: C.brand + "22" },
                  ]}
                >
                  <Feather
                    name={item.icon}
                    size={18}
                    color={active ? C.brand : palette.textSec}
                  />
                </View>
                <Text
                  style={[
                    styles.navLabel,
                    { color: active ? C.brand : palette.text },
                  ]}
                >
                  {item.label}
                </Text>
                {active && (
                  <View
                    style={[styles.activeDot, { backgroundColor: C.brand }]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sign out */}
        <View style={[styles.footer, { borderColor: palette.border }]}>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Feather name="log-out" size={18} color={C.danger} />
            <Text style={[styles.signOutText, { color: C.danger }]}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  appName: { fontSize: 18, fontWeight: "800", letterSpacing: 0.3 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "700" },
  userName: { fontSize: 14, fontWeight: "700" },
  userRole: { fontSize: 12, marginTop: 1, textTransform: "capitalize" },
  navList: { flex: 1, paddingHorizontal: 12, gap: 2 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  navLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  signOutText: { fontSize: 14, fontWeight: "600" },
});

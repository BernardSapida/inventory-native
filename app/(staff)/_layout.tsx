import Sidebar from "@/components/Sidebar";
import { useColors } from "@/lib/constants";
import { SidebarProvider } from "@/lib/sidebar";
import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function StaffLayoutContent() {
  const insets = useSafeAreaInsets();
  const C = useColors();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.surface,
            borderTopColor: C.border,
            borderTopWidth: 1,
            height: 62 + insets.bottom,
            paddingBottom: 8 + insets.bottom,
            paddingTop: 6,
          },
          tabBarActiveTintColor: C.brand,
          tabBarInactiveTintColor: C.textSec,
          tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Inventory",
            tabBarIcon: ({ color, size }) => (
              <Feather name="package" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="recipes"
          options={{
            title: "Recipes",
            tabBarIcon: ({ color, size }) => (
              <Feather name="book-open" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Feather name="user" size={size} color={color} />
            ),
          }}
        />
        {/* Hidden from tab bar - navigable via sidebar */}
        <Tabs.Screen name="inspection" options={{ href: null }} />
        <Tabs.Screen name="alerts" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="forecasting" options={{ href: null }} />
        <Tabs.Screen name="prepare" options={{ href: null }} />
      </Tabs>

      {/* Sidebar overlay */}
      <Sidebar role="staff" />
    </View>
  );
}

export default function StaffLayout() {
  return (
    <SidebarProvider>
      <StaffLayoutContent />
    </SidebarProvider>
  );
}

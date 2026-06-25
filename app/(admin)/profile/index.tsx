import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { useAppDialog } from "@/lib/dialog";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Spinner } from "heroui-native";
import { signOut, changePassword } from "@/lib/firebase/auth";
import { updateProfile } from "@/lib/firebase/users";
import { useAuthStore } from "@/store/auth";
import { useThemeStore } from "@/store/theme";
import { useColors, ColorPalette } from "@/lib/constants";
import { Toast } from "@/components/Toast";
import ScreenHeader from "@/components/ScreenHeader";

type Styles = ReturnType<typeof makeStyles>;

export default function AdminProfile() {
  const router = useRouter();
  const { user, reset, setUser } = useAuthStore();
  const isDark = useThemeStore((s) => s.isDark);
  const setDark = useThemeStore((s) => s.setDark);
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert, showConfirm } = useAppDialog();
  const [showEdit, setShowEdit] = useState(false);
  const [showPwChange, setShowPwChange] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "success") => {
      setToast({ msg, type });
    },
    [],
  );

  async function handleSignOut() {
    if (Platform.OS === "web") {
      if (!window.confirm("Are you sure you want to sign out?")) return;
      await signOut();
      reset();
    } else {
      showConfirm(
        "Sign Out",
        "Are you sure you want to sign out?",
        async () => {
          await signOut();
          reset();
        },
        "Sign Out",
      );
    }
  }

  async function handleSaveProfile() {
    if (!fullName.trim()) {
      showAlert("Required", "Full name cannot be empty.");
      return;
    }
    if (phoneNumber.trim() && !/^09\d{9}$/.test(phoneNumber.trim())) {
      showAlert(
        "Invalid Phone",
        "Phone number must start with 09 and be exactly 11 digits.",
      );
      return;
    }
    setSaving(true);
    try {
      await updateProfile(user!.uid, {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
      });
      setUser({
        ...user!,
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
      });
      setShowEdit(false);
      showToast("Profile updated");
    } catch (e: unknown) {
      showAlert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPw) {
      showAlert("Required", "Enter your current password.");
      return;
    }
    if (newPw.length < 6) {
      showAlert("Too short", "New password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      showAlert("Mismatch", "New passwords do not match.");
      return;
    }
    setChangingPw(true);
    const error = await changePassword(currentPw, newPw);
    setChangingPw(false);
    if (error) {
      showAlert("Error", error);
      return;
    }
    setShowPwChange(false);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    showToast("Password changed successfully");
  }

  const menuItems: {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    route: string;
    desc: string;
  }[] = [
    {
      icon: "users",
      label: "Staff Management",
      route: "/(admin)/profile/staff-management",
      desc: "Manage staff accounts",
    },
    {
      icon: "archive",
      label: "Archived Staff",
      route: "/(admin)/profile/archived-staff",
      desc: "View and restore archived staff",
    },
    {
      icon: "shield",
      label: "Roles & Permissions",
      route: "/(admin)/profile/roles-permissions",
      desc: "Configure staff permissions",
    },
  ];

  return (
    <View style={styles.root}>
      <ScreenHeader title="Profile" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
      {/* ── Profile Card ── */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.fullName?.[0] ?? "A").toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.fullName ?? "Administrator"}</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        <View style={styles.roleBadge}>
          <Feather name="shield" size={12} color={palette.brand} />
          <Text style={styles.roleText}>Admin</Text>
        </View>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => {
            setFullName(user?.fullName ?? "");
            setPhoneNumber(user?.phoneNumber ?? "");
            setShowEdit(true);
          }}
        >
          <Feather name="edit-2" size={14} color={palette.brand} />
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* ── Management Menu ── */}
      <Text style={styles.sectionLabel}>MANAGEMENT</Text>
      {menuItems.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={styles.menuItem}
          onPress={() => router.push(item.route as `/${string}`)}
          activeOpacity={0.8}
        >
          <View style={styles.menuIconWrap}>
            <Feather name={item.icon} size={18} color={palette.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuDesc}>{item.desc}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={palette.textSec} />
        </TouchableOpacity>
      ))}

      {/* ── Account Info ── */}
      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <View style={styles.infoCard}>
        <InfoRow
          icon="mail"
          label="Email"
          value={user?.email ?? "-"}
          styles={styles}
          palette={palette}
        />
        <InfoRow
          icon="phone"
          label="Phone"
          value={user?.phoneNumber || "-"}
          styles={styles}
          palette={palette}
        />
      </View>

      {/* ── Preferences ── */}
      <Text style={styles.sectionLabel}>PREFERENCES</Text>
      <View style={styles.prefCard}>
        <View style={styles.prefRow}>
          <View style={styles.prefIconWrap}>
            <Feather
              name={isDark ? "moon" : "sun"}
              size={16}
              color={palette.brand}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.prefLabel}>Dark Mode</Text>
            <Text style={styles.prefDesc}>
              {isDark ? "Switch to light theme" : "Switch to dark theme"}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={setDark}
            trackColor={{ false: palette.border, true: palette.brand }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* ── Security ── */}
      <Text style={styles.sectionLabel}>SECURITY</Text>
      <TouchableOpacity
        style={styles.securityItem}
        onPress={() => {
          setCurrentPw("");
          setNewPw("");
          setConfirmPw("");
          setShowPwChange(true);
        }}
      >
        <View style={styles.secIconWrap}>
          <Feather name="lock" size={16} color={palette.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.secLabel}>Change Password</Text>
          <Text style={styles.secDesc}>Update your account password</Text>
        </View>
        <Feather name="chevron-right" size={16} color={palette.textSec} />
      </TouchableOpacity>

      {/* ── Sign Out ── */}
      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={handleSignOut}
        activeOpacity={0.85}
      >
        <Feather name="log-out" size={18} color={palette.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* ── Edit Profile Modal ── */}
      <Modal
        visible={showEdit}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEdit(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>FULL NAME</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 14 }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
              placeholderTextColor={palette.textSec}
            />
            <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 20 }]}
              value={phoneNumber}
              onChangeText={(v) =>
                setPhoneNumber(v.replace(/\D/g, "").slice(0, 11))
              }
              placeholder="09XXXXXXXXX"
              placeholderTextColor={palette.textSec}
              keyboardType="phone-pad"
              maxLength={11}
            />
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveProfile}
              disabled={saving}
            >
              {saving ? (
                <Spinner size="sm" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal
        visible={showPwChange}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPwChange(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowPwChange(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>CURRENT PASSWORD</Text>
            <View style={[styles.pwRow, { marginBottom: 14 }]}>
              <TextInput
                style={[styles.formInput, { flex: 1, marginBottom: 0 }]}
                value={currentPw}
                onChangeText={setCurrentPw}
                secureTextEntry={!showCur}
                placeholder="Current password"
                placeholderTextColor={palette.textSec}
              />
              <TouchableOpacity
                onPress={() => setShowCur((v) => !v)}
                style={styles.eyeBtn}
              >
                <Feather
                  name={showCur ? "eye-off" : "eye"}
                  size={16}
                  color={palette.textSec}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
            <View style={[styles.pwRow, { marginBottom: 14 }]}>
              <TextInput
                style={[styles.formInput, { flex: 1, marginBottom: 0 }]}
                value={newPw}
                onChangeText={setNewPw}
                secureTextEntry={!showNew}
                placeholder="Min 6 characters"
                placeholderTextColor={palette.textSec}
              />
              <TouchableOpacity
                onPress={() => setShowNew((v) => !v)}
                style={styles.eyeBtn}
              >
                <Feather
                  name={showNew ? "eye-off" : "eye"}
                  size={16}
                  color={palette.textSec}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 20 }]}
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry
              placeholder="Re-enter new password"
              placeholderTextColor={palette.textSec}
            />
            <TouchableOpacity
              style={[styles.saveBtn, changingPw && { opacity: 0.6 }]}
              onPress={handleChangePassword}
              disabled={changingPw}
            >
              {changingPw ? (
                <Spinner size="sm" />
              ) : (
                <Text style={styles.saveBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          visible
          onHide={() => setToast(null)}
        />
      )}
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  styles,
  palette,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  styles: Styles;
  palette: ColorPalette;
}) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={14} color={palette.textSec} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    content: { padding: 20, paddingTop: 4, paddingBottom: 40 },
    profileCard: {
      backgroundColor: C.surface,
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.border,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.brandSoft,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
    },
    avatarText: { color: C.brand, fontSize: 28, fontWeight: "700" },
    name: { color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 4 },
    email: { color: C.textSec, fontSize: 13, marginBottom: 12 },
    roleBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: C.brandSoft,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
      marginBottom: 16,
    },
    roleText: { color: C.brand, fontSize: 12, fontWeight: "700" },
    editBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: C.brand,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    editBtnText: { color: C.brand, fontSize: 13, fontWeight: "600" },
    sectionLabel: {
      color: C.textSec,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      marginBottom: 10,
      marginTop: 4,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: C.border,
      gap: 14,
    },
    menuIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: C.brandSoft,
      justifyContent: "center",
      alignItems: "center",
    },
    menuLabel: { color: C.text, fontSize: 15, fontWeight: "600" },
    menuDesc: { color: C.textSec, fontSize: 12, marginTop: 2 },
    infoCard: {
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
      gap: 14,
    },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    infoLabel: { color: C.textSec, fontSize: 13, flex: 1 },
    infoValue: {
      color: C.text,
      fontSize: 13,
      fontWeight: "600",
      flex: 2,
      textAlign: "right",
    },
    prefCard: {
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
    },
    prefRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    prefIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: C.brandSoft,
      justifyContent: "center",
      alignItems: "center",
    },
    prefLabel: { color: C.text, fontSize: 15, fontWeight: "600" },
    prefDesc: { color: C.textSec, fontSize: 12, marginTop: 2 },
    securityItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
      gap: 12,
    },
    secIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: C.brandSoft,
      justifyContent: "center",
      alignItems: "center",
    },
    secLabel: { color: C.text, fontSize: 15, fontWeight: "600" },
    secDesc: { color: C.textSec, fontSize: 12, marginTop: 2 },
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.dangerSoft,
      borderRadius: 14,
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: C.danger + "40",
    },
    signOutText: { color: C.danger, fontSize: 15, fontWeight: "700" },
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    modalSheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    modalTitle: { color: C.text, fontSize: 18, fontWeight: "700" },
    fieldLabel: {
      color: C.textSec,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    formInput: {
      backgroundColor: C.surfaceAlt,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      height: 44,
      color: C.text,
      fontSize: 15,
    },
    pwRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surfaceAlt,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      paddingRight: 4,
    },
    eyeBtn: { padding: 10 },
    saveBtn: {
      backgroundColor: C.brand,
      borderRadius: 12,
      height: 52,
      justifyContent: "center",
      alignItems: "center",
    },
    saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  });
}

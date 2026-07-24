import type { Detection } from "@/lib/api";
import { scanImage } from "@/lib/api";
import { useAppDialog } from "@/lib/dialog";
import { useAuthStore } from "@/store/auth";
import { useInventoryStore } from "@/store/inventory";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Button, Dialog, Spinner } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

const CONFIDENCE_THRESHOLD = 0.5;
const POLL_MS = 500;
// How long the camera can scan without recognizing anything before we tell the
// user, instead of leaving them staring at a live feed that never responds.
const NO_DETECT_TIMEOUT_MS = 5000;

function capitalize(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatExpiry(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [detections, setDetections] = useState<Detection[]>([]);
  const [lastDetections, setLastDetections] = useState<Detection[]>([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notRecognized, setNotRecognized] = useState(false);
  const [cameraSize, setCameraSize] = useState({ width: 1, height: 1 });
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });

  const cameraRef = useRef<CameraView>(null);
  const isCapturingRef = useRef(false);
  const isModalOpenRef = useRef(false);
  // Timestamp of when the current "nothing detected" streak started. The polling
  // closure is created once, so we track this in a ref rather than stale state.
  const emptySinceRef = useRef<number | null>(null);
  // Mirror of lastDetections readable from inside the polling closure.
  const lastDetectionsRef = useRef<Detection[]>([]);

  const { addToInventory } = useInventoryStore();
  const user = useAuthStore((s) => s.user);
  const { showAlert } = useAppDialog();

  // Keep ref in sync so the polling closure can read it without stale state
  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
    if (isModalOpen) setDetections([]);
  }, [isModalOpen]);

  useEffect(() => {
    if (!permission?.granted) return;

    let mounted = true;

    const poll = async () => {
      if (
        isCapturingRef.current ||
        isModalOpenRef.current ||
        !cameraRef.current
      )
        return;
      isCapturingRef.current = true;
      if (mounted) setIsRequesting(true);

      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.3,
        });
        if (!mounted || !photo?.base64 || isModalOpenRef.current) return;

        if (photo.width && photo.height) {
          setImageSize({ width: photo.width, height: photo.height });
        }

        const res = await scanImage(photo.base64);
        if (!mounted || isModalOpenRef.current) return;

        const detected = res.data.detections ?? [];
        setDetections(detected);
        if (detected.length > 0) {
          setLastDetections(detected);
          lastDetectionsRef.current = detected;
          // Something matched -- clear any "not recognizable" state/streak.
          emptySinceRef.current = null;
          setNotRecognized(false);
        } else if (lastDetectionsRef.current.length === 0) {
          // Nothing detected yet this session. Once we've been scanning empty for
          // NO_DETECT_TIMEOUT_MS, surface a response so the user isn't left guessing.
          const now = Date.now();
          if (emptySinceRef.current == null) {
            emptySinceRef.current = now;
          } else if (now - emptySinceRef.current >= NO_DETECT_TIMEOUT_MS) {
            setNotRecognized(true);
          }
        }
      } catch {
        // skip failed frames silently
      } finally {
        isCapturingRef.current = false;
        if (mounted) setIsRequesting(false);
      }
    };

    const id = setInterval(poll, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [permission?.granted]);

  const handleConfirm = async () => {
    setIsModalOpen(false);
    await addToInventory(lastDetections, user?.fullName);
    const count = lastDetections.length;
    showAlert(
      "Added to Inventory",
      `${count} item${count > 1 ? "s" : ""} added successfully.`,
      [{ text: "OK", onPress: () => router.back() }],
    );
  };

  const scaleX = cameraSize.width / imageSize.width;
  const scaleY = cameraSize.height / imageSize.height;

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.permText}>Camera access is required.</Text>
        <Button variant="primary" onPress={requestPermission}>
          <Button.Label>Grant Permission</Button.Label>
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      {/* Camera + SVG bounding box overlay */}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          setCameraSize({ width, height });
        }}
      >
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
        />

        <Svg
          style={StyleSheet.absoluteFill}
          width={cameraSize.width}
          height={cameraSize.height}
        >
          {detections.map((det, di) =>
            det.boxes
              .filter((b) => b.confidence >= CONFIDENCE_THRESHOLD)
              .map((box, bi) => {
                const x = box.x1 * scaleX;
                const y = box.y1 * scaleY;
                const w = (box.x2 - box.x1) * scaleX;
                const h = (box.y2 - box.y1) * scaleY;
                const label = `${capitalize(det.name)} ${(box.confidence * 100).toFixed(0)}%`;
                const labelW = Math.max(label.length * 7.5, 60);
                const labelY = Math.max(0, y - 22);
                return (
                  <G key={`${di}-${bi}`}>
                    <Rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="transparent"
                    />
                    <Rect
                      x={x}
                      y={labelY}
                      width={labelW}
                      height={22}
                      fill="rgba(0,0,0,0.65)"
                      rx={3}
                    />
                    <SvgText
                      x={x + 4}
                      y={labelY + 15}
                      fill="white"
                      fontSize={12}
                      fontWeight="600"
                    >
                      {label}
                    </SvgText>
                  </G>
                );
              }),
          )}
        </Svg>
      </View>

      {/* "Not recognizable" response: shown after we've scanned for a few seconds
          without matching anything. Non-blocking so scanning keeps running and it
          disappears the moment a product is recognized. */}
      {notRecognized && detections.length === 0 && !isModalOpen && (
        <View style={styles.notice} pointerEvents="none">
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Item not recognizable</Text>
            <Text style={styles.noticeText}>
              Point the camera directly at a product and hold steady. Make sure
              it&apos;s well lit and fills the frame.
            </Text>
          </View>
        </View>
      )}

      {/* Top bar: back + spinner */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        {isRequesting && (
          <View style={styles.spinnerBadge}>
            <Spinner size="sm" />
          </View>
        )}
      </SafeAreaView>

      {/* Bottom overlay: detection summary chips + confirm button */}
      <View style={styles.bottomOverlay}>
        {detections.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
            contentContainerStyle={styles.chipRowContent}
          >
            {detections.map((det, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>
                  {capitalize(det.name)} ×{det.quantity}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        <Button
          variant="primary"
          size="lg"
          isDisabled={lastDetections.length === 0}
          onPress={() => setIsModalOpen(true)}
        >
          <Button.Label>Confirm</Button.Label>
        </Button>
      </View>

      {/* Confirmation modal */}
      <Dialog isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>
              {lastDetections.length === 1
                ? "Detected Item"
                : `Detected ${lastDetections.length} Items`}
            </Dialog.Title>

            <ScrollView style={styles.modalScroll}>
              {lastDetections.map((det, i) => (
                <View key={i} style={styles.modalItem}>
                  {lastDetections.length > 1 && (
                    <Text style={styles.modalItemIndex}>Item {i + 1}</Text>
                  )}
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Name</Text>
                    <Text style={styles.modalValue}>{capitalize(det.name)}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Quantity</Text>
                    <Text style={styles.modalValue}>{det.quantity}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Unit</Text>
                    <Text style={styles.modalValue}>{det.unit}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Category</Text>
                    <Text style={styles.modalValue}>{det.category}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Expiry Date</Text>
                    <Text style={styles.modalValue}>
                      {formatExpiry(det.expirationDate)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button variant="tertiary" onPress={() => setIsModalOpen(false)}>
                <Button.Label>Retake</Button.Label>
              </Button>
              <Button variant="primary" onPress={handleConfirm}>
                <Button.Label>Add to Inventory</Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", gap: 16 },
  permText: { color: "#fff", fontSize: 16, textAlign: "center" },

  notice: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  noticeCard: {
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    gap: 8,
    maxWidth: 340,
  },
  noticeTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  noticeText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backBtn: {
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
  },
  backBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  spinnerBadge: {
    margin: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingBottom: 48,
    paddingHorizontal: 16,
    gap: 12,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  chipRow: { width: "100%" },
  chipRowContent: { gap: 8 },
  chip: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  chipText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  modalScroll: { maxHeight: 320, marginVertical: 8 },
  modalItem: { marginBottom: 14 },
  modalItemIndex: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    marginBottom: 4,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  modalLabel: { fontSize: 14, color: "#6b7280", fontWeight: "500" },
  modalValue: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
});

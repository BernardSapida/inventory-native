import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

if (__DEV__) {
  console.log("[api] baseURL:", BASE_URL);
}

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (__DEV__) {
      console.error("[api] request failed:", {
        fullURL: `${err.config?.baseURL}${err.config?.url}`,
        code: err.code,
        status: err.response?.status,
        message: err.message,
      });
    }
    return Promise.reject(err);
  }
);

export interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expirationDate: string;
  status: string;
  countable: boolean;
  barcode: string;
  minimumThreshold: number;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

export interface Detection {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expirationDate: string;
  boxes: BoundingBox[];
}

export interface ScanResponse {
  detections: Detection[];
  total_items: number;
}

export const scanImage = (base64: string) =>
  api.post<ScanResponse>("/scan", { image: base64 });

export const getInventory = () => api.get<InventoryItem[]>("/inventory");

export const saveInventory = (
  items: Omit<InventoryItem, "id">[],
  addedBy?: string,
) => api.post("/inventory", { items, addedBy });

export const deleteInventoryItem = (id: number) =>
  api.delete(`/inventory/${id}`);

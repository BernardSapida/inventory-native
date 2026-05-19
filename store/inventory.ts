import { create } from "zustand";
import {
  Detection,
  InventoryItem,
  deleteInventoryItem,
  getInventory,
  saveInventory,
} from "@/lib/api";

interface InventoryStore {
  items: InventoryItem[];
  isLoading: boolean;
  error: string | null;
  fetchInventory: () => Promise<void>;
  addToInventory: (detections: Detection[]) => Promise<void>;
  removeItem: (id: number) => Promise<void>;
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchInventory: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await getInventory();
      set({ items: res.data });
    } catch (e: any) {
      set({ error: e?.message ?? "Unknown error" });
    } finally {
      set({ isLoading: false });
    }
  },

  addToInventory: async (detections: Detection[]) => {
    const items = detections.map((d) => ({
      name: d.name,
      quantity: d.quantity,
      unit: d.unit,
      category: d.category,
      expirationDate: d.expirationDate,
    }));
    await saveInventory(items);
    await get().fetchInventory();
  },

  removeItem: async (id: number) => {
    await deleteInventoryItem(id);
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
  },
}));

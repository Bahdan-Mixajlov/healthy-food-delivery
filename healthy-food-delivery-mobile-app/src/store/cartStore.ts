import { create } from "zustand";

export interface CartItem {
  id: string;
  title: string;
  weight: string;
  price: number;
  image: string;
  quantity: number;
  calories: number;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, amount?: number) => void;
  removeItem: (id: string) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (newItem, amount = 1) =>
    set((state) => {
      const existingItem = state.items.find((item) => item.id === newItem.id);
      if (existingItem) {
        return {
          items: state.items.map((item) =>
            item.id === newItem.id
              ? { ...item, quantity: item.quantity + amount }
              : item,
          ),
        };
      }
      return { items: [...state.items, { ...newItem, quantity: amount }] };
    }),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  increaseQuantity: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    })),

  decreaseQuantity: (id) =>
    set((state) => ({
      items: state.items
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0),
    })),

  clearCart: () => set({ items: [] }),

  getTotalPrice: () => {
    return get().items.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );
  },
}));

import { create } from 'zustand';

export interface BusinessFilters {
  page: number;
  pageSize: number;
  state?: string;
  businessType?: string;
  minRating?: number;
  maxRating?: number;
  minDomainConfidence?: number;
  minEmailConfidence?: number;
  minPhoneConfidence?: number;
  hasEmail?: boolean;
  hasPhone?: boolean;
  sortBy: 'name' | 'city' | 'state' | 'rating' | 'serpDomainConfidence';
  sortOrder: 'asc' | 'desc';
}

interface BusinessFilterStore {
  filters: BusinessFilters;
  setFilter: <K extends keyof BusinessFilters>(key: K, value: BusinessFilters[K]) => void;
  setFilters: (filters: Partial<BusinessFilters>) => void;
  resetFilters: () => void;
}

const defaultFilters: BusinessFilters = {
  page: 1,
  pageSize: 20,
  sortBy: 'name',
  sortOrder: 'asc',
};

export const useBusinessFilterStore = create<BusinessFilterStore>((set) => ({
  filters: defaultFilters,

  setFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
        // Reset to page 1 when changing filters (except when changing page itself)
        ...(key !== 'page' && { page: 1 }),
      },
    })),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...newFilters,
      },
    })),

  resetFilters: () =>
    set({
      filters: defaultFilters,
    }),
}));

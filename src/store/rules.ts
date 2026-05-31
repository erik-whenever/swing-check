import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import type { Rule } from '../types';
import type { LibraryRule } from '../data/ruleLibrary';

interface RulesState {
  rules: Rule[];
  addRule: (rule: Omit<Rule, 'id' | 'active'>) => void;
  addFromLibrary: (libRule: LibraryRule) => void;
  updateRule: (id: string, updates: Partial<Rule>) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;
  soloRule: (id: string) => void;
  hasLibraryRule: (libraryId: string) => boolean;
}

export const useRulesStore = create<RulesState>()(
  persist(
    (set, get) => ({
      rules: [],
      addRule: (rule) =>
        set((state) => ({
          rules: [...state.rules, { ...rule, id: uuid(), active: true }],
        })),
      addFromLibrary: (libRule) =>
        set((state) => ({
          rules: [
            ...state.rules,
            {
              id: uuid(),
              title: libRule.title,
              description: libRule.description,
              phase: libRule.phase,
              weight: libRule.weight,
              active: true,
              angles: libRule.angles,
              libraryId: libRule.id,
              drills: libRule.drills,
            },
          ],
        })),
      updateRule: (id, updates) =>
        set((state) => ({
          rules: state.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),
      removeRule: (id) =>
        set((state) => ({
          rules: state.rules.filter((r) => r.id !== id),
        })),
      toggleRule: (id) =>
        set((state) => ({
          rules: state.rules.map((r) =>
            r.id === id ? { ...r, active: !r.active } : r
          ),
        })),
      soloRule: (id) =>
        set((state) => ({
          rules: state.rules.map((r) => ({
            ...r,
            active: r.id === id,
          })),
        })),
      hasLibraryRule: (libraryId) =>
        get().rules.some((r) => r.libraryId === libraryId),
    }),
    { name: 'swingcheck-rules' }
  )
);

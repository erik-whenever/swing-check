import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  /** Has the user finished (or skipped) the first-run wizard? */
  completed: boolean;
  complete: () => void;
  /** Re-open the wizard from settings / help. */
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      complete: () => set({ completed: true }),
      reset: () => set({ completed: false }),
    }),
    { name: 'swingcheck-onboarding' }
  )
);

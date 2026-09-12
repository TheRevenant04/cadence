import { create } from 'zustand'

const KEY = 'cadence.onboarded.v1'

function readSeen(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(KEY) === '1'
}

interface OnboardingState {
  open: boolean
  userHasSeenTour: boolean
  showTour: () => void
  closeTour: () => void
  completeTour: () => void
  refresh: () => void
}

export const useOnboardingStore = create<OnboardingState>()((set) => ({
  open: false,
  userHasSeenTour: readSeen(),

  showTour() {
    set({ open: true })
  },
  closeTour() {
    set({ open: false })
  },
  completeTour() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, '1')
    set({ open: false, userHasSeenTour: true })
  },
  refresh() {
    set({ userHasSeenTour: readSeen() })
  },
}))
import { create } from 'zustand'
import { api } from '@/api'
import type { User } from '@/types'

export type AuthStatus = 'loading' | 'guest' | 'authed'

interface AuthState {
  user: User | null
  status: AuthStatus
  hydrate: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'loading',

  async hydrate() {
    if (get().status === 'authed') return
    try {
      const me = await api.auth.me()
      set({ user: me?.user ?? null, status: me ? 'authed' : 'guest' })
    } catch {
      set({ user: null, status: 'guest' })
    }
  },

  async login(email, password) {
    const { user } = await api.auth.login(email, password)
    set({ user, status: 'authed' })
  },

  async signup(email, password) {
    const { user } = await api.auth.signup(email, password)
    set({ user, status: 'authed' })
  },

  async logout() {
    try {
      await api.auth.logout()
    } finally {
      set({ user: null, status: 'guest' })
    }
  },
}))
'use client'

import { create } from 'zustand'

export type ViewName =
  | 'dashboard' | 'orders' | 'order-detail' | 'products' | 'inventory' | 'quality'
  | 'release' | 'devices' | 'device' | 'service' | 'reports' | 'admin' | 'architecture'

export interface SessionUserClient {
  id: string
  username: string
  fullName: string
  role: string
  roleLabel: string
  permissions: string[]
}

export interface NavParams {
  id?: string
  serial?: string
  tab?: string
  q?: string
}

interface AppState {
  user: SessionUserClient | null
  view: ViewName
  params: NavParams
  setUser: (u: SessionUserClient | null) => void
  navigate: (view: ViewName, params?: NavParams) => void
  can: (perm: string) => boolean
}

export const useApp = create<AppState>((set, get) => ({
  user: null,
  view: 'dashboard',
  params: {},
  setUser: (u) => set({ user: u }),
  navigate: (view, params = {}) => set({ view, params }),
  can: (perm) => {
    const u = get().user
    return !!u && u.permissions.includes(perm)
  },
}))

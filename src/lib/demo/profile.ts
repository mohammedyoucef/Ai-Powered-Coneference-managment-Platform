'use client'

import { useSyncExternalStore } from 'react'
import type { DemoProfile, UserRole } from './types'

const PROFILE_KEY = 'confexa_profile_v1'
const AI_SETTINGS_KEY = 'confexa_ai_settings_v1'
const UPDATED_EVENT = 'confexa-profile-updated'

export const DEFAULT_META_MODEL = 'muse-wonder-1.0'
export const DEFAULT_META_ENDPOINT = 'https://api.meta.ai/v1/responses'

export type AISettings = {
  apiKey: string
  model: string
  endpoint: string
  /** Image-capable Meta model for AI image generation. Empty = use the main model. */
  imageModel?: string
}

const defaultProfile: DemoProfile = { displayName: '', role: 'chair' }
const defaultAISettings: AISettings = { apiKey: '', model: DEFAULT_META_MODEL, endpoint: DEFAULT_META_ENDPOINT, imageModel: '' }

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT))
  } catch {
    // ignore
  }
}

export function getProfile(): DemoProfile {
  const p = readJson(PROFILE_KEY, defaultProfile)
  const roles: UserRole[] = ['chair', 'organizer', 'author', 'reviewer']
  return { displayName: p.displayName || '', role: roles.includes(p.role) ? p.role : 'chair' }
}

export function saveProfile(profile: DemoProfile): void {
  writeJson(PROFILE_KEY, profile)
}

export function getAISettings(): AISettings {
  const s = readJson(AI_SETTINGS_KEY, defaultAISettings)
  return {
    apiKey: s.apiKey || '',
    model: s.model || DEFAULT_META_MODEL,
    endpoint: s.endpoint || DEFAULT_META_ENDPOINT,
    imageModel: s.imageModel || '',
  }
}

export function saveAISettings(settings: AISettings): void {
  writeJson(AI_SETTINGS_KEY, settings)
}

export function clearAISettings(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(AI_SETTINGS_KEY)
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT))
  } catch {
    // ignore
  }
}

/** Headers sent to our own /api/ai/* routes. The key is never persisted server-side. */
export function getAIRequestHeaders(): Record<string, string> {
  const s = getAISettings()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s.apiKey) headers['x-meta-api-key'] = s.apiKey
  if (s.model) headers['x-meta-model'] = s.model
  if (s.endpoint) headers['x-meta-endpoint'] = s.endpoint
  if (s.imageModel) headers['x-meta-image-model'] = s.imageModel
  return headers
}

/* ---------------- React bindings ---------------- */

function subscribe(callback: () => void): () => void {
  if (!isBrowser()) return () => {}
  window.addEventListener(UPDATED_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(UPDATED_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

let profileCache: { raw: string | null; value: DemoProfile } | null = null
let aiCache: { raw: string | null; value: AISettings } | null = null

function profileSnapshot(): DemoProfile {
  if (!isBrowser()) return defaultProfile
  let raw: string | null = null
  try { raw = window.localStorage.getItem(PROFILE_KEY) } catch { raw = null }
  if (profileCache && profileCache.raw === raw) return profileCache.value
  const value = getProfile()
  profileCache = { raw, value }
  return value
}

function aiSnapshot(): AISettings {
  if (!isBrowser()) return defaultAISettings
  let raw: string | null = null
  try { raw = window.localStorage.getItem(AI_SETTINGS_KEY) } catch { raw = null }
  if (aiCache && aiCache.raw === raw) return aiCache.value
  const value = getAISettings()
  aiCache = { raw, value }
  return value
}

/**
 * Real signed-in identity from /api/auth/me (server session).
 * `role` is a display heuristic only — real authorization is enforced
 * server-side per organization/conference. Falls back to the legacy
 * local demo profile name prefill when signed out.
 */
let meCache: DemoProfile | null = null
let meLoading = false

export function useProfile(): DemoProfile {
  const server = useSyncExternalStore(
    (cb) => {
      if (isBrowser() && !meCache && !meLoading) {
        meLoading = true
        fetch('/api/auth/me', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => {
            if (d.user) {
              meCache = {
                displayName: d.user.displayName || d.user.email || '',
                role: d.user.platformRole === 'platform_admin' ? 'chair' : 'author',
              }
              window.dispatchEvent(new CustomEvent(UPDATED_EVENT))
            }
          })
          .catch(() => {})
          .finally(() => { meLoading = false })
      }
      return subscribe(cb)
    },
    () => meCache ?? profileSnapshot(),
    () => defaultProfile,
  )
  return server
}

export function invalidateProfileCache() {
  meCache = null
  meLoading = false
}

export function useAISettings(): AISettings {
  return useSyncExternalStore(subscribe, aiSnapshot, () => defaultAISettings)
}

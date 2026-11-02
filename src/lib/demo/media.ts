'use client'

import { useEffect, useState } from 'react'

/**
 * Uploaded images live in the same IndexedDB database as PDFs
 * (store "images"), referenced from website configs by media id.
 */

const DB_NAME = 'confexa-files'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('pdfs')) req.result.createObjectStore('pdfs')
      if (!req.result.objectStoreNames.contains('images')) req.result.createObjectStore('images')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open media storage'))
  })
}

export async function saveImage(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite')
    tx.objectStore('images').put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save image'))
  })
  db.close()
}

export async function getImage(id: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const req = db.transaction('images', 'readonly').objectStore('images').get(id)
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
      req.onerror = () => reject(req.error ?? new Error('Failed to load image'))
    })
    db.close()
    return result
  } catch {
    return null
  }
}

export async function deleteImage(id: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction('images', 'readwrite')
      tx.objectStore('images').delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    // ignore
  }
}

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Only image files are accepted.'
  if (file.size === 0) return 'The selected file is empty.'
  if (file.size > MAX_IMAGE_BYTES) return `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is 5 MB.`
  return null
}

/** Resolve an uploaded media id to a temporary object URL (null while loading/missing). */
export function useMediaUrl(mediaId?: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!mediaId) return
    let objectUrl: string | null = null
    let cancelled = false
    getImage(mediaId).then((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaId])
  return mediaId ? url : null
}

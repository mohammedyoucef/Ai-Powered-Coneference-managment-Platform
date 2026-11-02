'use client'

/**
 * PDF blobs live in IndexedDB (localStorage is far too small for files).
 * Submission metadata in localStorage references the blob by submission id.
 */

const DB_NAME = 'confexa-files'
const STORE = 'pdfs'
export const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10 MB

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      if (!req.result.objectStoreNames.contains('images')) req.result.createObjectStore('images')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open file storage'))
  })
}

export async function savePdf(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save PDF'))
  })
  db.close()
}

export async function getPdf(id: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
      req.onerror = () => reject(req.error ?? new Error('Failed to load PDF'))
    })
    db.close()
    return result
  } catch {
    return null
  }
}

export async function deletePdf(id: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    // ignore
  }
}

export function validatePdfFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return 'Only PDF files are accepted.'
  if (file.size === 0) return 'The selected file is empty.'
  if (file.size > MAX_PDF_BYTES) return `PDF is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is 10 MB.`
  return null
}

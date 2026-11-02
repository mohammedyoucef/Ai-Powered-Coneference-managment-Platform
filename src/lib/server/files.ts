import { mkdir, writeFile, readFile, unlink } from 'fs/promises'
import path from 'path'

export const MAX_PDF_BYTES = 10 * 1024 * 1024

export function uploadDir(): string {
  return process.env.CONFEXA_UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads')
}

export async function saveSubmissionFile(submissionId: string, kind: 'manuscript' | 'camera', bytes: Uint8Array): Promise<string> {
  const dir = uploadDir()
  await mkdir(dir, { recursive: true })
  const name = `${submissionId}-${kind}.pdf`
  await writeFile(path.join(dir, name), bytes)
  return name
}

export async function readSubmissionFile(filePath: string): Promise<Buffer | null> {
  try {
    // Only bare filenames are ever stored; refuse path traversal.
    const safe = path.basename(filePath)
    return await readFile(path.join(uploadDir(), safe))
  } catch {
    return null
  }
}

export async function deleteSubmissionFile(filePath?: string | null): Promise<void> {
  if (!filePath) return
  try {
    await unlink(path.join(uploadDir(), path.basename(filePath)))
  } catch {
    // already gone
  }
}

export function validatePdfBytes(fileName: string, bytes: Uint8Array, maxBytes: number = MAX_PDF_BYTES): string | null {
  if (!fileName.toLowerCase().endsWith('.pdf')) return 'Only PDF files are accepted.'
  if (bytes.length === 0) return 'The selected file is empty.'
  if (bytes.length > maxBytes) return `PDF is too large. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`
  const head = Buffer.from(bytes.slice(0, 5)).toString('latin1')
  if (!head.startsWith('%PDF-')) return 'The file does not look like a valid PDF (missing %PDF header).'
  return null
}

'use client'

export type PdfExtraction = {
  text: string
  pageCount: number
  note?: string
}

const MAX_CHARS = 12000
const MAX_PAGES = 20

/** Extract plain text from a PDF in the browser with pdf.js. Never throws. */
export async function extractPdfText(file: File): Promise<PdfExtraction> {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const buffer = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: buffer }).promise
    const pageCount = doc.numPages
    const parts: string[] = []
    const pages = Math.min(pageCount, MAX_PAGES)
    for (let p = 1; p <= pages; p += 1) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const line = content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ')
      parts.push(line)
      if (parts.join('\n').length > MAX_CHARS) break
    }
    const text = parts.join('\n').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
    if (!text) {
      return { text: '', pageCount, note: 'No selectable text was found in this PDF (it may be scanned images). AI review will use the abstract only.' }
    }
    return {
      text,
      pageCount,
      note: pageCount > pages ? `Text extracted from the first ${pages} of ${pageCount} pages.` : undefined,
    }
  } catch {
    return { text: '', pageCount: 0, note: 'Text extraction failed in this browser. AI review will use the abstract only.' }
  }
}

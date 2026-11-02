/** Client-side image helpers: downscale uploads so they can be stored as
 * data: URLs in the database without multi-megabyte payloads. */

function drawToDataUrl(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

export function imageFileToDataUrl(file: File, maxDim = 512, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Choose an image file (PNG, JPG, or WebP).'))
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try { resolve(drawToDataUrl(img, maxDim, quality)) } catch (err) { reject(err instanceof Error ? err : new Error('Could not process that image.')) }
      URL.revokeObjectURL(url)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image file.')) }
    img.src = url
  })
}

export function dataUrlToShrunkDataUrl(dataUrl: string, maxDim = 1400, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try { resolve(drawToDataUrl(img, maxDim, quality)) } catch (err) { reject(err instanceof Error ? err : new Error('Could not process the generated image.')) }
    }
    img.onerror = () => reject(new Error('Could not read the generated image.'))
    img.src = dataUrl
  })
}

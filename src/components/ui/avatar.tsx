export function Avatar({ name, url, size = 36 }: { name: string; url?: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data:/external avatar URLs are user-provided
      <img src={url} alt={name} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    )
  }
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-[#4F46E5] font-semibold text-white" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}>
      {initials}
    </span>
  )
}

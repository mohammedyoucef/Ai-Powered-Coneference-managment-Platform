import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-6xl font-bold text-gray-900">404</h1>
      <h2 className="text-xl font-semibold text-gray-900">Page not found</h2>
      <p className="text-gray-600">The page you are looking for does not exist.</p>
      <div className="flex gap-2">
        <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]">
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/events">Browse events</Link>
        </Button>
      </div>
    </div>
  )
}

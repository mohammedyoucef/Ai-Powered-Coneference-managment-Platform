'use client'

import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold text-gray-900">Something went wrong</h1>
      <p className="text-gray-600">An unexpected error occurred.</p>
      <Button onClick={() => reset()} className="bg-[#4F46E5] hover:bg-[#4338CA]">
        Try again
      </Button>
    </div>
  )
}

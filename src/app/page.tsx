import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowRight, Users, FileText, CheckCircle } from 'lucide-react'

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="py-20 text-center">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Conference Management
            <span className="block text-[#4F46E5]">Made Simple</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            Streamline submissions, peer review, and event organization in one clean platform.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="bg-[#4F46E5] hover:bg-[#4338CA]">
              <Link href="/register">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/events">Browse Events</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Everything you need</h2>
            <p className="mt-4 text-lg text-gray-600">Manage your conference from start to finish</p>
          </div>
          
          <div className="grid gap-8 md:grid-cols-3">
            <div className="bg-white p-8 rounded-lg border">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#4F46E5]/10 mb-4">
                <Users className="h-6 w-6 text-[#4F46E5]" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Organize</h3>
              <p className="text-gray-600">
                Create organizations, manage conferences, and build your event website.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-lg border">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#4F46E5]/10 mb-4">
                <FileText className="h-6 w-6 text-[#4F46E5]" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Submit</h3>
              <p className="text-gray-600">
                Easy submission process for researchers with secure document uploads.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-lg border">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#4F46E5]/10 mb-4">
                <CheckCircle className="h-6 w-6 text-[#4F46E5]" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Review</h3>
              <p className="text-gray-600">
                Structured peer review with clear workflows and decision tracking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold text-gray-900">Ready to get started?</h2>
          <p className="mt-4 text-lg text-gray-600">
            Join Confexa to manage your conference with ease.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="bg-[#4F46E5] hover:bg-[#4338CA]">
              <Link href="/register">
                Create Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

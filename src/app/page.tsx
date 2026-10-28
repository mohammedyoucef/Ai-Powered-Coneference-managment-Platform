import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-col items-center justify-center gap-8 py-16 text-center sm:py-24">
      <div className="flex flex-col items-center gap-4">
        <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Academic SaaS · Built for international conferences
        </div>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          AI-powered conference management, refined for scholarly work
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Confexa brings together conference creation, paper submissions, AI-assisted
          analysis, and structured review workflows in one trusted platform.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/conferences/new">Create a conference</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
      <div className="mt-8 grid w-full max-w-4xl gap-6 sm:grid-cols-3">
        <div className="rounded-lg border p-6 text-left">
          <h3 className="font-medium">Structured workflows</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Clear tracks for submissions, review, and editorial decisions.
          </p>
        </div>
        <div className="rounded-lg border p-6 text-left">
          <h3 className="font-medium">AI-assisted insights</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Evidence-based analysis prepared for human review.
          </p>
        </div>
        <div className="rounded-lg border p-6 text-left">
          <h3 className="font-medium">Professional presence</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Clean, accessible interfaces designed for global academic audiences.
          </p>
        </div>
      </div>
    </section>
  );
}

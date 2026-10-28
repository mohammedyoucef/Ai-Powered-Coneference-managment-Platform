export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your conferences and activity.
        </p>
      </header>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          This area is not implemented yet. Authentication and data will be added later.
        </p>
      </div>
    </div>
  )
}

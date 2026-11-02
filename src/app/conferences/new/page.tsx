import { ConferenceForm } from '@/components/conferences/conference-form'

export default function NewConferencePage() {
  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Create conference</h1>
        <p className="text-sm text-[#64748B]">Step 2 of the workflow: describe the event, save the draft, then generate its website.</p>
      </header>
      <ConferenceForm />
    </div>
  )
}

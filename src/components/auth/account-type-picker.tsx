'use client'

import { ACCOUNT_TYPE_META, type AccountType } from '@/lib/demo/types'

export const ACCOUNT_TYPES: AccountType[] = ['organizer', 'researcher', 'reviewer', 'visitor']

const ICONS: Record<AccountType, string> = {
  organizer: '◈',
  researcher: '✎',
  reviewer: '✓',
  visitor: '🎟',
}

export function AccountTypePicker({
  value,
  onChange,
  name = 'accountType',
}: {
  value: AccountType
  onChange: (v: AccountType) => void
  name?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-[#111827]">
        I am joining as <span className="font-normal text-[#64748B]">— choose your primary workspace</span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Account type">
        {ACCOUNT_TYPES.map((t) => {
          const meta = ACCOUNT_TYPE_META[t]
          const selected = value === t
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(t)}
              className={`flex flex-col gap-1.5 rounded-xl border-2 p-3.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] ${
                selected
                  ? 'border-[#4F46E5] bg-indigo-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
              }`}
            >
              <span className="flex items-center justify-between">
                <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${selected ? 'bg-[#4F46E5] text-white' : 'bg-slate-100 text-[#475569]'}`}>{ICONS[t]}</span>
                <span aria-hidden className={`h-4 w-4 rounded-full border-2 ${selected ? 'border-[#4F46E5] bg-[#4F46E5] ring-2 ring-white ring-inset' : 'border-slate-300 bg-white'}`} />
              </span>
              <span className="text-sm font-semibold text-[#111827]">{meta.label}</span>
              <span className="text-xs leading-relaxed text-[#64748B]">{meta.description}</span>
            </button>
          )
        })}
      </div>
      <input type="hidden" name={name} value={value} />
      <p className="text-xs text-[#64748B]">
        Your primary type determines your dashboard and what the server allows this account to do. It is fixed after registration — use a separate account for a different role.
      </p>
    </fieldset>
  )
}

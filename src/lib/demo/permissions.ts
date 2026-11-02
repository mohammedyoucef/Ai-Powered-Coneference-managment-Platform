import type { DemoData } from './types'

/**
 * Client-side manager check (the server enforces the same rules on every
 * mutation). Managing an organization/conference requires BOTH an
 * Organizer account AND an owner/admin role in that organization.
 * A Researcher/Reviewer/Visitor account never gets organizer controls,
 * even if it was invited into an organization as a plain member — plain
 * members are collaborators/viewers, not managers.
 */
export function canManageOrganization(data: DemoData, organizationId: string): boolean {
  const user = data.currentUser
  if (!user) return false
  if (user.platformRole === 'platform_admin') return true
  if (user.accountType !== 'organizer') return false
  return data.members.some(
    (m) => m.organizationId === organizationId && m.userId === user.id && (m.role === 'owner' || m.role === 'admin'),
  )
}

export function isOrgMember(data: DemoData, organizationId: string): boolean {
  const user = data.currentUser
  if (!user) return false
  if (user.platformRole === 'platform_admin') return true
  return data.members.some((m) => m.organizationId === organizationId && m.userId === user.id)
}

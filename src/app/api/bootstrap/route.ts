import { NextResponse } from 'next/server'
import { getCurrentUser, isPlatformAdmin, errorJson } from '@/lib/server/auth'
import { query, publicUser } from '@/lib/server/db'
import { serializeOrg, serializeConference, serializeSubmission } from '@/lib/server/serialize'
import { serializeVisitorApplication, serializeReviewerApplication, serializeReviewerInvitation } from '@/lib/server/business'
import { canAccessConference } from '@/lib/server/auth'
import type { DemoData } from '@/lib/demo/types'

type Row = Record<string, unknown>

/**
 * One authorized dataset for the client, filtered on the SERVER:
 * - anonymous: only published public conferences + their published sites
 * - author: own submissions (+ released decisions/feedback)
 * - reviewer: assigned submissions (anonymized when double-blind)
 * - org owner/admin/member: everything inside their organizations
 * - platform admin: everything
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    const admin = user ? isPlatformAdmin(user) : false

    const memberships = user && !admin
      ? await query<Row>('select * from organization_members where user_id=$1', [user.id])
      : user && admin
        ? await query<Row>('select * from organization_members')
        : []
    const memberOrgIds = new Set(memberships.map((m) => String(m.organization_id)))
    if (admin) {
      const all = await query<Row>('select id from organizations')
      all.forEach((o) => memberOrgIds.add(String(o.id)))
    }

    const orgRows = await query<Row>('select * from organizations order by created_at')
    const roleByOrg = new Map(memberships.map((m) => [String(m.organization_id), String(m.role)]))

    const confRows = await query<Row>('select * from conferences order by created_at')
    const accessibleConfs: Row[] = []
    for (const c of confRows) {
      if (memberOrgIds.has(String(c.organization_id))) { accessibleConfs.push(c); continue }
      if (user && c.created_by === user.id) { accessibleConfs.push(c); continue }
      // Public published events for everyone; private/draft events only with
      // a participation grant (checked in SQL inside canAccessConference).
      if (await canAccessConference(user, c as never)) accessibleConfs.push(c)
    }
    // Organizations behind published public events are public identities
    // (name/slug already shown in the events directory): include them so
    // authors can open their own submission pages. Membership/manager
    // rights still come only from organization_members (see members and
    // managedConfIds below), never from this list.
    const publicOrgIds = new Set(
      accessibleConfs
        .filter((c) => c.visibility === 'public' && c.lifecycle !== 'draft' && c.lifecycle !== 'archived')
        .map((c) => String(c.organization_id)),
    )
    const confById = new Map(accessibleConfs.map((c) => [String(c.id), c]))
    // Only organization owners/admins manage a conference. Plain members
    // (any account type) are collaborators: they must not receive other
    // authors' submissions or website drafts through this dataset.
    const managedConfIds = new Set(
      accessibleConfs
        .filter((c) => admin || roleByOrg.get(String(c.organization_id)) === 'owner' || roleByOrg.get(String(c.organization_id)) === 'admin')
        .map((c) => String(c.id)),
    )

    // Assignments for reviewer filtering
    const assignmentRows = user
      ? await query<Row>(
          `select a.*, u.display_name as reviewer_name, u.email as reviewer_email from review_assignments a join users u on u.id=a.reviewer_id
           where a.reviewer_id=$1 or a.submission_id in (select id from submissions where conference_id = any($2::text[]))`,
          [user.id, [...managedConfIds]],
        ).catch(() => query<Row>('select a.*, u.display_name as reviewer_name, u.email as reviewer_email from review_assignments a join users u on u.id=a.reviewer_id where a.reviewer_id=$1', [user.id]))
      : []
    const assignedSubIds = new Set(assignmentRows.filter((a) => String(a.reviewer_id) === user?.id).map((a) => String(a.submission_id)))

    const subRows = await query<Row>(
      `select s.*, (select u.display_name from review_assignments a join users u on u.id=a.reviewer_id where a.submission_id=s.id order by a.created_at limit 1) as assigned_reviewer_name,
              (select a.reviewer_id from review_assignments a where a.submission_id=s.id order by a.created_at limit 1) as assigned_reviewer_id
       from submissions s order by s.created_at`,
    )
    const visibleSubs: Row[] = []
    for (const s of subRows) {
      const conf = confById.get(String(s.conference_id))
      if (!conf) continue
      const isManager = managedConfIds.has(String(s.conference_id))
      const isAuthor = user && s.author_id === user.id
      const isReviewer = assignedSubIds.has(String(s.id))
      // Submissions are confidential: only managers, the author, and assigned
      // reviewers ever receive them. Accepted-paper listings on public sites
      // come from the organizer-published website snapshot, not from here.
      if (isManager || isAuthor || isReviewer) {
        const anonymize = Boolean(isReviewer && !isManager && !isAuthor && conf.review_method === 'double_blind')
        visibleSubs.push({ ...s, _anonymize: anonymize, _isManager: isManager, _isAuthor: isAuthor })
      }
    }
    const visibleSubIds = new Set(visibleSubs.map((s) => String(s.id)))

    const reviewRows = (await query<Row>('select * from reviews order by created_at')).filter((r) => {
      if (!visibleSubIds.has(String(r.submission_id))) return false
      const sub = visibleSubs.find((s) => String(s.id) === String(r.submission_id))
      if (sub?._isManager) return true
      if (user && r.reviewer_id === user.id) return true
      // Authors only see submitted feedback after decisions are released.
      if (sub?._isAuthor && sub.decision_released && r.status === 'submitted') return true
      return false
    })
    const aiRows = (await query<Row>('select * from ai_reviews order by created_at')).filter((r) => {
      if (!visibleSubIds.has(String(r.submission_id))) return false
      const sub = visibleSubs.find((s) => String(s.id) === String(r.submission_id))
      return Boolean(sub?._isManager) || (user ? assignedSubIds.has(String(r.submission_id)) : false)
    })

    const websiteRows = await query<Row>('select * from website_configs')
    const websiteConfigs = websiteRows.filter((w) => !w.is_published && confById.has(String(w.conference_id)) && (managedConfIds.has(String(w.conference_id)) || admin)).map((w) => w.config as DemoData['websiteConfigs'][number])
    const publishedWebsiteConfigs = websiteRows.filter((w) => w.is_published && confById.has(String(w.conference_id))).map((w) => w.config as DemoData['websiteConfigs'][number])

    // People directory: members of shared orgs + self (never the whole user table)
    let users: DemoData['users'] = []
    let members: DemoData['members'] = []
    if (user) {
      const memberRows = await query<Row>(
        `select m.*, u.email, u.display_name, u.affiliation, u.platform_role, u.account_type, u.created_at as user_created_at
         from organization_members m join users u on u.id=m.user_id where m.organization_id = any($1::text[])`,
        [[...memberOrgIds]],
      ).catch(() => [] as Row[])
      members = memberRows.map((m) => ({
        organizationId: String(m.organization_id), userId: String(m.user_id), role: String(m.role) as 'owner' | 'admin' | 'member',
        createdAt: new Date(String(m.created_at)).toISOString(),
        user: { id: String(m.user_id), email: String(m.email), displayName: String(m.display_name), affiliation: (m.affiliation as string) || undefined, platformRole: m.platform_role === 'platform_admin' ? 'platform_admin' : 'user', accountType: m.account_type === 'reviewer' || m.account_type === 'organizer' || m.account_type === 'visitor' ? m.account_type : 'researcher', createdAt: new Date(String(m.user_created_at)).toISOString() },
      }))
      const byId = new Map<string, DemoData['users'][number]>()
      members.forEach((m) => m.user && byId.set(m.user.id, m.user))
      assignmentRows.forEach((a) => byId.set(String(a.reviewer_id), { id: String(a.reviewer_id), email: String(a.reviewer_email), displayName: String(a.reviewer_name), platformRole: 'user', accountType: 'reviewer', createdAt: new Date().toISOString() }))
      if (user) byId.set(user.id, publicUser(user))
      users = [...byId.values()]
    }

    const invitations = user
      ? await query<Row>('select * from invitations where organization_id = any($1::text[]) order by created_at desc', [[...memberOrgIds]]).catch(() => [] as Row[])
      : []
    const notifications = user
      ? await query<Row>('select * from notifications where user_id=$1 order by created_at desc limit 100', [user.id])
      : []
    const activity = user
      ? await query<Row>('select * from activity_log where conference_id = any($1::text[]) or organization_id = any($2::text[]) order by created_at desc limit 50', [[...managedConfIds], [...memberOrgIds]]).catch(() => [] as Row[])
      : []

    // ---- Business-logic entities (filtered server-side) ----
    const accessibleConfIds = accessibleConfs.map((c) => String(c.id))
    const visitorApplicationRows = user
      ? await query<Row>(`select va.*, u.display_name as visitor_name, u.email as visitor_email, c.title as conference_title from visitor_applications va join users u on u.id=va.visitor_id join conferences c on c.id=va.conference_id
           where va.visitor_id=$1 or va.conference_id = any($2::text[]) order by va.created_at desc`, [user.id, [...managedConfIds]]).catch(() => [] as Row[])
      : []
    const paymentRows = user
      ? await query<Row>('select * from payments where user_id=$1 or conference_id = any($2::text[]) order by created_at desc', [user.id, [...managedConfIds]]).catch(() => [] as Row[])
      : []
    const reviewerApplicationRows = user
      ? await query<Row>(`select ra.*, u.display_name as reviewer_name, u.email as reviewer_email, c.title as conference_title from reviewer_applications ra join users u on u.id=ra.reviewer_id join conferences c on c.id=ra.conference_id
           where ra.reviewer_id=$1 or ra.conference_id = any($2::text[]) order by ra.created_at desc`, [user.id, [...managedConfIds]]).catch(() => [] as Row[])
      : []
    const reviewerInvitationRows = user
      ? await query<Row>(`select ri.*, c.title as conference_title from reviewer_invitations ri join conferences c on c.id=ri.conference_id
           where ri.reviewer_id=$1 or lower(ri.email)=lower($2) or ri.conference_id = any($3::text[]) order by ri.created_at desc`, [user.id, user.email, [...managedConfIds]]).catch(() => [] as Row[])
      : []
    const eventInvitationRows = user
      ? await query<Row>('select * from event_invitations where user_id=$1 or lower(email)=lower($2) or conference_id = any($3::text[]) order by created_at desc', [user.id, user.email, [...managedConfIds]]).catch(() => [] as Row[])
      : []
    // AI screenings are organizer-only (they contain eligibility assessments).
    const aiScreeningRows = user && managedConfIds.size
      ? await query<Row>('select * from ai_screenings where conference_id = any($1::text[]) order by created_at desc', [[...managedConfIds]]).catch(() => [] as Row[])
      : []
    const announcementRows = accessibleConfIds.length
      ? await query<Row>('select * from event_announcements where conference_id = any($1::text[]) order by created_at desc limit 100', [accessibleConfIds]).catch(() => [] as Row[])
      : []

    const data: DemoData = {
      organizations: orgRows
        .filter((o) => memberOrgIds.has(String(o.id)) || publicOrgIds.has(String(o.id)))
        .map((o) => serializeOrg(o, roleByOrg.get(String(o.id)) || (admin ? 'owner' : undefined))),
      conferences: accessibleConfs.map(serializeConference),
      websiteConfigs,
      publishedWebsiteConfigs,
      submissions: visibleSubs.map((s) => serializeSubmission(s, { anonymize: Boolean(s._anonymize) })),
      reviews: reviewRows.map((r) => {
        const sub = visibleSubs.find((s) => String(s.id) === String(r.submission_id))
        const conf = sub ? confById.get(String(sub.conference_id)) : undefined
        const viewerIsManager = Boolean(sub?._isManager)
        const viewerIsReviewer = user && r.reviewer_id === user.id
        const hideIdentity = !viewerIsManager && !viewerIsReviewer && conf?.review_method === 'double_blind'
        return {
          id: String(r.id), submissionId: String(r.submission_id), reviewerName: hideIdentity ? 'Anonymous reviewer' : String(r.reviewer_name),
          reviewerId: hideIdentity ? undefined : ((r.reviewer_id as string) || undefined), assignmentId: (r.assignment_id as string) || undefined,
          overallScore: Number(r.overall_score), criteriaScores: (typeof r.criteria_scores === 'object' ? r.criteria_scores : {}) as Record<string, number>,
          recommendation: String(r.recommendation) as DemoData['reviews'][number]['recommendation'],
          comments: String(r.comments || ''),
          // Confidential comments are organizer/reviewer-only, never for authors.
          confidentialComments: viewerIsManager || viewerIsReviewer ? ((r.confidential_comments as string) || undefined) : undefined,
          status: r.status === 'draft' ? 'draft' : 'submitted',
          createdAt: new Date(String(r.created_at)).toISOString(), updatedAt: new Date(String(r.updated_at)).toISOString(),
        }
      }),
      aiReviews: aiRows.map((r) => ({ ...((r.payload as object) || {}), id: String(r.id), submissionId: String(r.submission_id), source: String(r.source) === 'meta' ? 'meta' : 'fallback', model: (r.model as string) || undefined, createdAt: new Date(String(r.created_at)).toISOString() }) as DemoData['aiReviews'][number]),
      currentUser: user ? publicUser(user) : null,
      members,
      invitations: invitations.map((i) => ({ id: String(i.id), organizationId: String(i.organization_id), email: String(i.email), role: String(i.role) as 'owner' | 'admin' | 'member', status: String(i.status) as 'pending' | 'accepted' | 'revoked', createdAt: new Date(String(i.created_at)).toISOString(), expiresAt: i.expires_at ? new Date(String(i.expires_at)).toISOString() : undefined })),
      assignments: assignmentRows.map((a) => ({ id: String(a.id), submissionId: String(a.submission_id), reviewerId: String(a.reviewer_id), status: String(a.status) as 'invited' | 'completed' | 'declined', dueDate: a.due_date ? String(a.due_date).slice(0, 10) : undefined, createdAt: new Date(String(a.created_at)).toISOString(), reviewer: { id: String(a.reviewer_id), email: String(a.reviewer_email), displayName: String(a.reviewer_name), platformRole: 'user' as const, accountType: 'reviewer' as const, createdAt: new Date().toISOString() } })),
      notifications: notifications.map((n) => ({ id: String(n.id), userId: String(n.user_id), type: String(n.type), title: String(n.title), body: (n.body as string) || undefined, link: (n.link as string) || undefined, isRead: Boolean(n.is_read), emailStatus: (String(n.email_status) as 'not_configured' | 'queued' | 'sent') || 'not_configured', createdAt: new Date(String(n.created_at)).toISOString() })),
      users,
      activity: activity.map((a) => ({ id: String(a.id), userId: (a.user_id as string) || undefined, organizationId: (a.organization_id as string) || undefined, conferenceId: (a.conference_id as string) || undefined, action: String(a.action), details: (a.details as string) || undefined, createdAt: new Date(String(a.created_at)).toISOString() })),
      visitorApplications: visitorApplicationRows.map(serializeVisitorApplication),
      payments: paymentRows.map((p) => ({ id: String(p.id), visitorApplicationId: String(p.visitor_application_id), conferenceId: String(p.conference_id), userId: String(p.user_id), amountCents: Number(p.amount_cents), currency: String(p.currency), status: String(p.status) as 'pending' | 'succeeded' | 'failed' | 'refunded' | 'unconfigured', provider: (p.provider as string) || undefined, createdAt: new Date(String(p.created_at)).toISOString() })),
      reviewerApplications: reviewerApplicationRows.map(serializeReviewerApplication),
      reviewerInvitations: reviewerInvitationRows.map(serializeReviewerInvitation),
      eventInvitations: eventInvitationRows.map((i) => ({ id: String(i.id), conferenceId: String(i.conference_id), email: String(i.email), invitedRole: String(i.invited_role) as 'visitor' | 'researcher', status: String(i.status) as 'pending' | 'accepted' | 'revoked', createdAt: new Date(String(i.created_at)).toISOString() })),
      aiScreenings: aiScreeningRows.map((s) => ({ id: String(s.id), visitorApplicationId: String(s.visitor_application_id), conferenceId: String(s.conference_id), source: String(s.source) as 'meta' | 'fallback' | 'unavailable', model: (s.model as string) || undefined, recommendation: String(s.recommendation) as 'appears_to_meet' | 'additional_info_needed' | 'may_not_meet' | 'unable_to_determine', assessment: (s.assessment as Record<string, unknown>) || {}, createdAt: new Date(String(s.created_at)).toISOString() })),
      announcements: announcementRows.map((a) => ({ id: String(a.id), conferenceId: String(a.conference_id), title: String(a.title), body: (a.body as string) || undefined, audience: String(a.audience) as 'all' | 'visitors' | 'researchers' | 'reviewers', createdAt: new Date(String(a.created_at)).toISOString() })),
    }
    return NextResponse.json({ data })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

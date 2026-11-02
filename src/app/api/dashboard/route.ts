import { NextResponse } from 'next/server'
import { getCurrentUser, errorJson } from '@/lib/server/auth'
import { query } from '@/lib/server/db'

function fmtD(v: unknown): string | undefined {
  if (!v) return undefined
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  return String(v).slice(0, 10)
}

/** Role-tailored metrics, all computed from real PostgreSQL rows. */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const admin = user.platform_role === 'platform_admin'
    const myOrgs = admin
      ? await query('select * from organizations order by created_at desc')
      : await query('select o.* from organizations o join organization_members m on m.organization_id=o.id where m.user_id=$1 order by o.created_at desc', [user.id])
    const orgIds = myOrgs.map((o) => String(o.id))
    const confs = orgIds.length
      ? await query('select * from conferences where organization_id = any($1::text[]) order by created_at desc', [orgIds])
      : []
    const confIds = confs.map((c) => String(c.id))
    const subs = confIds.length ? await query('select * from submissions where conference_id = any($1::text[]) order by created_at desc', [confIds]) : []
    const mySubs = await query('select * from submissions where author_id=$1 order by created_at desc', [user.id])
    const myAssignments = await query(
      `select a.*, s.title as sub_title, s.conference_id from review_assignments a join submissions s on s.id=a.submission_id where a.reviewer_id=$1 order by a.created_at desc`,
      [user.id],
    )
    const pendingReviews = myAssignments.filter((a) => a.status !== 'completed')
    const reviews = confIds.length
      ? await query('select r.* from reviews r join submissions s on s.id=r.submission_id where s.conference_id = any($1::text[])', [confIds])
      : []
    const activity = orgIds.length
      ? await query('select * from activity_log where organization_id = any($1::text[]) order by created_at desc limit 20', [orgIds])
      : []
    // Visitor + reviewer event-level data (real rows only)
    const myVisitorApps = await query(
      `select va.*, c.title as conference_title, c.start_date, c.slug as conference_slug from visitor_applications va join conferences c on c.id=va.conference_id where va.visitor_id=$1 order by va.created_at desc`, [user.id]).catch(() => [])
    const orgVisitorApps = confIds.length
      ? await query(`select va.*, c.title as conference_title from visitor_applications va join conferences c on c.id=va.conference_id where va.conference_id = any($1::text[]) order by va.created_at desc`, [confIds]).catch(() => [])
      : []
    const myReviewerApps = await query(
      `select ra.*, c.title as conference_title from reviewer_applications ra join conferences c on c.id=ra.conference_id where ra.reviewer_id=$1 order by ra.created_at desc`, [user.id]).catch(() => [])
    const orgReviewerApps = confIds.length
      ? await query(`select ra.*, c.title as conference_title, u.display_name as reviewer_name, u.email as reviewer_email from reviewer_applications ra join conferences c on c.id=ra.conference_id join users u on u.id=ra.reviewer_id where ra.conference_id = any($1::text[]) order by ra.created_at desc`, [confIds]).catch(() => [])
      : []
    const myReviewerInvites = await query(
      `select ri.*, c.title as conference_title from reviewer_invitations ri join conferences c on c.id=ri.conference_id where ri.reviewer_id=$1 or lower(ri.email)=lower($2) order by ri.created_at desc`, [user.id, user.email]).catch(() => [])
    const notifications = await query('select * from notifications where user_id=$1 order by created_at desc limit 8', [user.id]).catch(() => [])
    const confTitle = new Map(confs.map((c) => [String(c.id), String(c.title)]))
    const mySubsWithConf: Record<string, unknown>[] = await query<Record<string, unknown>>(
      `select s.*, c.title as conference_title, c.submission_deadline, c.start_date from submissions s join conferences c on c.id=s.conference_id where s.author_id=$1 order by s.created_at desc`, [user.id]).catch(() => mySubs.map((s) => ({ ...s, conference_title: confTitle.get(String(s.conference_id)) || '' })))
    const platform = admin
      ? {
          users: Number((await query<{ n: string }>("select count(*)::text as n from users"))[0]?.n || 0),
          organizations: Number((await query<{ n: string }>("select count(*)::text as n from organizations"))[0]?.n || 0),
          conferences: Number((await query<{ n: string }>("select count(*)::text as n from conferences"))[0]?.n || 0),
          submissions: Number((await query<{ n: string }>("select count(*)::text as n from submissions"))[0]?.n || 0),
          reviews: Number((await query<{ n: string }>("select count(*)::text as n from reviews"))[0]?.n || 0),
          database: 'PostgreSQL (DATABASE_URL)',
        }
      : null
    // Organizer-facing registered-user directory (names, account types,
    // avatars, expertise). This is NOT platform administration: no platform
    // roles are exposed and it grants no admin capability. It exists so
    // organizers can find reviewers/researchers for their own events.
    const isOrganizerSide = user.account_type === 'organizer' || orgIds.length > 0 || admin
    const directory = isOrganizerSide
      ? (await query('select * from users order by display_name limit 300')).map((r) => {
          let profile: Record<string, unknown> = {}
          if (typeof r.profile === 'object' && r.profile !== null) profile = r.profile as Record<string, unknown>
          else if (typeof r.profile === 'string') { try { profile = JSON.parse(r.profile) as Record<string, unknown> } catch { profile = {} } }
          return {
            id: String(r.id), displayName: String(r.display_name), email: String(r.email),
            accountType: r.account_type === 'reviewer' || r.account_type === 'organizer' || r.account_type === 'visitor' ? r.account_type : 'researcher',
            affiliation: (r.affiliation as string) || undefined,
            avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined,
            expertise: Array.isArray(profile.expertise) ? profile.expertise.map(String) : [],
            researchInterests: Array.isArray(profile.researchInterests) ? profile.researchInterests.map(String) : [],
          }
        })
      : []
    return NextResponse.json({
      directory,
      user: { id: user.id, email: user.email, displayName: user.display_name, platformRole: user.platform_role, accountType: user.account_type === 'reviewer' || user.account_type === 'organizer' || user.account_type === 'visitor' ? user.account_type : 'researcher' },
      organizer: {
        organizations: myOrgs.length,
        conferences: confs.length,
        publishedWebsites: confIds.length ? (await query('select conference_id from website_configs where is_published=true and conference_id = any($1::text[])', [confIds])).length : 0,
        submissions: subs.length,
        submitted: subs.filter((s) => s.status === 'Submitted').length,
        underReview: subs.filter((s) => s.status === 'Under Review').length,
        accepted: subs.filter((s) => s.status === 'Accepted' || s.status === 'Camera-Ready Submitted').length,
        rejected: subs.filter((s) => s.status === 'Rejected').length,
        reviewsCompleted: reviews.filter((r) => r.status === 'submitted').length,
        pendingAssignments: myAssignments.length ? 0 : 0,
        outstandingReviews: subs.filter((s) => s.status === 'Submitted' || s.status === 'Under Review').length,
        byStatus: Object.fromEntries([...new Set(confs.map((c) => String(c.lifecycle)))].map((l) => [l, confs.filter((c) => String(c.lifecycle) === l).length])),
        visitorApplications: orgVisitorApps.length,
        visitorPending: orgVisitorApps.filter((a) => a.status === 'pending_review' || a.status === 'pending_payment').length,
        visitorApproved: orgVisitorApps.filter((a) => a.status === 'approved').length,
        reviewerApplicationsPending: orgReviewerApps.filter((a) => a.status === 'pending').length,
        reviewerApplications: orgReviewerApps.map((a) => ({ id: String(a.id), conferenceId: String(a.conference_id), conferenceTitle: String(a.conference_title || ''), reviewerId: String(a.reviewer_id), reviewerName: (a.reviewer_name as string) || undefined, reviewerEmail: (a.reviewer_email as string) || undefined, status: String(a.status), createdAt: new Date(String(a.created_at)).toISOString() })),
        visitorList: orgVisitorApps.slice(0, 8).map((a) => ({ id: String(a.id), conferenceId: String(a.conference_id), conferenceTitle: String(a.conference_title || ''), status: String(a.status), paymentStatus: String(a.payment_status) })),
        conferencesList: confs.map((c) => ({ id: String(c.id), title: String(c.title), slug: String(c.slug), lifecycle: String(c.lifecycle), organizationId: String(c.organization_id), submissionDeadline: fmtD(c.submission_deadline), startDate: fmtD(c.start_date) })),
      },
      author: {
        submissions: mySubs.length,
        underReview: mySubs.filter((s) => s.status === 'Under Review').length,
        accepted: mySubs.filter((s) => s.status === 'Accepted' || s.status === 'Camera-Ready Submitted').length,
        rejected: mySubs.filter((s) => s.status === 'Rejected').length,
        revisionRequested: mySubs.filter((s) => s.status === 'Revision Requested').length,
        cameraReadyRequested: mySubs.filter((s) => s.status === 'Camera-Ready Requested' || s.status === 'Accepted').length,
        decisionsAvailable: mySubs.filter((s) => s.decision_released).length,
        list: mySubsWithConf.map((s) => ({ id: String(s.id), title: String(s.title), status: String(s.status), conferenceId: String(s.conference_id), conferenceTitle: String(s.conference_title || ''), submissionDeadline: fmtD(s.submission_deadline), decisionReleased: Boolean(s.decision_released), updatedAt: new Date(String(s.updated_at)).toISOString(), createdAt: new Date(String(s.created_at)).toISOString() })),
      },
      reviewer: {
        assigned: myAssignments.length,
        pending: pendingReviews.length,
        completed: myAssignments.filter((a) => a.status === 'completed').length,
        invitationsPending: myReviewerInvites.filter((i) => i.status === 'invited').length,
        applicationsPending: myReviewerApps.filter((a) => a.status === 'pending').length,
        applicationsApproved: myReviewerApps.filter((a) => a.status === 'approved').length,
        invitations: myReviewerInvites.map((i) => ({ id: String(i.id), conferenceId: String(i.conference_id), conferenceTitle: String(i.conference_title || ''), status: String(i.status) })),
        applications: myReviewerApps.map((a) => ({ id: String(a.id), conferenceId: String(a.conference_id), conferenceTitle: String(a.conference_title || ''), status: String(a.status) })),
        list: myAssignments.map((a) => ({ id: String(a.id), submissionId: String(a.submission_id), title: String(a.sub_title), conferenceId: String(a.conference_id), status: String(a.status), dueDate: a.due_date ? String(a.due_date).slice(0, 10) : undefined })),
      },
      visitor: {
        applications: myVisitorApps.length,
        pending: myVisitorApps.filter((a) => a.status === 'pending_review' || a.status === 'pending_payment' || a.status === 'draft').length,
        approved: myVisitorApps.filter((a) => a.status === 'approved').length,
        waitlisted: myVisitorApps.filter((a) => a.status === 'waitlisted').length,
        list: myVisitorApps.map((a) => ({ id: String(a.id), conferenceId: String(a.conference_id), conferenceTitle: String(a.conference_title || ''), conferenceSlug: String((a as Record<string, unknown>).conference_slug || ''), startDate: fmtD((a as Record<string, unknown>).start_date), status: String(a.status), paymentStatus: String(a.payment_status) })),
      },
      notifications: notifications.map((n) => ({ id: String(n.id), type: String(n.type), title: String(n.title), body: (n.body as string) || undefined, isRead: Boolean(n.is_read), createdAt: new Date(String(n.created_at)).toISOString() })),
      activity: activity.map((a) => ({ id: String(a.id), action: String(a.action), details: (a.details as string) || undefined, createdAt: new Date(String(a.created_at)).toISOString() })),
      platform,
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

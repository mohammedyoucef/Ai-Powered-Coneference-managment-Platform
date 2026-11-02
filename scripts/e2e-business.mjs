/**
 * End-to-end business-logic verification (scenarios A–G from the spec).
 * Runs against a running app (BASE_URL, default http://localhost:3000) and
 * uses only the public HTTP API with separate accounts per role.
 * Unique emails per run so it is re-runnable against a shared database.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const run = Date.now().toString(36)
const PW = 'Test1234x'
let failures = 0
let step = 0

function check(name, cond, extra = '') {
  step += 1
  if (cond) console.log(`ok ${step} - ${name}`)
  else { failures += 1; console.log(`NOT OK ${step} - ${name} ${extra}`) }
}

function client() {
  let cookie = ''
  return {
    async call(method, path, body, isForm = false) {
      const headers = { ...(cookie ? { cookie } : {}) }
      let payload
      if (body !== undefined) {
        if (isForm) payload = body
        else { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
      }
      const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect: 'manual' })
      const setCookie = res.headers.get('set-cookie')
      if (setCookie) cookie = setCookie.split(';')[0]
      const text = await res.text()
      let json = {}
      try { json = JSON.parse(text) } catch { /* file downloads etc. */ }
      return { status: res.status, json, text }
    },
  }
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')

async function register(email, accountType, extra = {}) {
  const c = client()
  const r = await c.call('POST', '/api/auth/register', {
    displayName: `E2E ${accountType} ${run}`, email, password: PW, accountType,
    affiliation: 'E2E University', termsAccepted: true,
    profile: accountType === 'organizer' ? { position: 'Chair' } : accountType === 'reviewer' ? { expertise: ['AI'], researchInterests: ['AI'] } : {},
    ...extra,
  })
  return { c, r }
}

const orgEmail = `e2e-org-${run}@example.com`
const revEmail = `e2e-rev-${run}@example.com`
const resEmail = `e2e-res-${run}@example.com`
const visEmail = `e2e-vis-${run}@example.com`
const ghostEmail = `e2e-ghost-${run}@example.com`

// ---------- Scenario A: organizer creates & publishes an event ----------
const organizer = await register(orgEmail, 'organizer')
check('A1 register organizer', organizer.r.status === 200 && organizer.r.json.user?.accountType === 'organizer', JSON.stringify(organizer.r.json))
const orgRes = await organizer.c.call('POST', '/api/organizations', { name: `E2E Org ${run}`, description: 'e2e' })
check('A2 create organization', orgRes.status === 201, JSON.stringify(orgRes.json))
const orgId = orgRes.json.organization?.id
const confRes = await organizer.c.call('POST', '/api/conferences', {
  organizationId: orgId, title: `E2E Conference ${run}`, slug: `e2e-conf-${run}`,
  shortDescription: 'E2E event', startDate: '2027-06-01', endDate: '2027-06-03', submissionDeadline: '2027-01-01',
  researchTopics: ['AI'], submissionTypes: ['Full paper'], visibility: 'public',
  submissionsEnabled: true, registrationEnabled: true, registrationMode: 'approval',
  eligibilityCriteria: ['Must be enrolled at a university'], eligibilityQuestions: ['What is your university?'],
  reviewerMode: 'both',
})
check('A3 create event (draft)', confRes.status === 201 && confRes.json.conference?.lifecycle === 'draft', JSON.stringify(confRes.json))
const confId = confRes.json.conference?.id

const anon = client()
let pubBefore = await anon.call('GET', '/api/events')
check('A4 draft not in public directory', !pubBefore.json.events?.some((e) => e.id === confId))
const life = await organizer.c.call('POST', `/api/conferences/${confId}/lifecycle`, { lifecycle: 'published' })
check('A5 publish event', life.status === 200, JSON.stringify(life.json))
pubBefore = await anon.call('GET', '/api/events')
check('A6 published event in public directory', pubBefore.json.events?.some((e) => e.id === confId && e.submissionsEnabled === true))
const editRes = await organizer.c.call('PATCH', `/api/conferences/${confId}`, { shortDescription: 'E2E event edited' })
check('A7 edit persists', editRes.status === 200 && editRes.json.conference?.shortDescription === 'E2E event edited')

// ---------- Accounts for B–G ----------
const reviewer = await register(revEmail, 'reviewer')
const researcher = await register(resEmail, 'researcher')
const visitor = await register(visEmail, 'visitor')
check('register reviewer/researcher/visitor', [reviewer, researcher, visitor].every((x) => x.r.status === 200), `${reviewer.r.status} ${researcher.r.status} ${visitor.r.status}`)
check('visitor account type persisted', visitor.r.json.user?.accountType === 'visitor')

// ---------- Scenario G (early): role restrictions ----------
const visOrg = await visitor.c.call('POST', '/api/organizations', { name: `Nope ${run}` })
check('G1 visitor cannot create organization', visOrg.status === 403, `got ${visOrg.status}`)
const revOrg = await reviewer.c.call('POST', '/api/organizations', { name: `Nope2 ${run}` })
check('G2 reviewer cannot create organization', revOrg.status === 403)
const visConf = await visitor.c.call('POST', '/api/conferences', { organizationId: orgId, title: 'Nope event' })
check('G3 visitor cannot create event', visConf.status === 403)
const typeChange = await visitor.c.call('PATCH', '/api/auth/me', { accountType: 'organizer' })
check('G4 account type cannot be changed via profile payload', typeChange.status === 400, `got ${typeChange.status}`)

// ---------- Scenario B: reviewer application / invitation / assignment ----------
const appRes = await reviewer.c.call('POST', `/api/conferences/${confId}/reviewer-applications`, { message: 'AI expertise' })
check('B1 reviewer applies to event', appRes.status === 201 && appRes.json.application?.status === 'pending', JSON.stringify(appRes.json))
const appId = appRes.json.application?.id

// Organizer inviting: unknown email, wrong type, then the happy path via a 2nd reviewer
const ghostInvite = await organizer.c.call('POST', `/api/conferences/${confId}/reviewer-invitations`, { email: ghostEmail })
check('B2 invite unknown email explains registration first', ghostInvite.status === 404 && /register as a Reviewer/i.test(ghostInvite.json.error || ''), JSON.stringify(ghostInvite.json))
const wrongType = await organizer.c.call('POST', `/api/conferences/${confId}/reviewer-invitations`, { email: resEmail })
check('B3 invite non-reviewer account rejected', wrongType.status === 400 && /not as a Reviewer/i.test(wrongType.json.error || ''))
const goodInvite = await organizer.c.call('POST', `/api/conferences/${confId}/reviewer-invitations`, { email: revEmail })
check('B4 invite registered reviewer (even with pending application)', goodInvite.status === 201 || goodInvite.status === 409, JSON.stringify(goodInvite.json))
const dupInvite = await organizer.c.call('POST', `/api/conferences/${confId}/reviewer-invitations`, { email: revEmail })
check('B5 duplicate invitation prevented', dupInvite.status === 409, `got ${dupInvite.status}`)

// Approve the application (organizer decision)
const approve = await organizer.c.call('PATCH', `/api/reviewer-applications/${appId}`, { status: 'approved' })
check('B6 organizer approves reviewer application', approve.status === 200 && approve.json.application?.status === 'approved', JSON.stringify(approve.json))
const revDash = await reviewer.c.call('GET', '/api/dashboard')
check('B7 reviewer sees approved application', revDash.json.reviewer?.applications?.some((a) => a.id === appId && a.status === 'approved'))

// If an invitation was created, accept it; then assignment must be possible after submission exists (Scenario C)
// ---------- Scenario C: researcher submits ----------
const form = new FormData()
form.set('title', `E2E Paper ${run}`)
form.set('abstract', 'This paper presents a thorough evaluation of trustworthy AI systems with reproducible experiments.')
form.set('authors', 'E2E Author')
form.set('topics', 'AI')
form.set('file', new Blob([PDF], { type: 'application/pdf' }), 'paper.pdf')
const subRes = await researcher.c.call('POST', `/api/conferences/${confId}/submissions`, form, true)
check('C1 researcher submits paper', subRes.status === 201 && subRes.json.submission?.status === 'Submitted', JSON.stringify(subRes.json).slice(0, 300))
const subId = subRes.json.submission?.id

const visSubForm = new FormData()
visSubForm.set('title', 'Visitor paper attempt')
visSubForm.set('abstract', 'Visitors must not be able to submit academic papers to events at all.')
visSubForm.set('authors', 'Visitor')
visSubForm.set('file', new Blob([PDF], { type: 'application/pdf' }), 'paper.pdf')
const visSub = await visitor.c.call('POST', `/api/conferences/${confId}/submissions`, visSubForm, true)
check('G5 visitor cannot submit papers', visSub.status === 403, `got ${visSub.status}`)

const orgDash = await organizer.c.call('GET', '/api/dashboard')
check('C2 organizer dashboard counts submission', orgDash.json.organizer?.submissions >= 1)

// Assign to approved reviewer
const assign = await organizer.c.call('POST', `/api/submissions/${subId}/assignments`, { reviewerEmail: revEmail })
check('B8/C3 assign approved reviewer', assign.status === 200, JSON.stringify(assign.json))
const dupAssign = await organizer.c.call('POST', `/api/submissions/${subId}/assignments`, { reviewerEmail: revEmail })
check('B9 duplicate assignment prevented', dupAssign.status === 409)
// Researcher cannot be assigned (wrong type)
const badAssign = await organizer.c.call('POST', `/api/submissions/${subId}/assignments`, { reviewerEmail: resEmail })
check('B10 assigning non-reviewer rejected', badAssign.status === 400)

// Reviewer can download assigned file; an unrelated account cannot
const fileOk = await reviewer.c.call('GET', `/api/submissions/${subId}/file`)
check('D0 reviewer downloads assigned file', fileOk.status === 200)
const fileDenied = await visitor.c.call('GET', `/api/submissions/${subId}/file`)
check('G6 visitor cannot download paper file', fileDenied.status === 403, `got ${fileDenied.status}`)
const bootVis = await visitor.c.call('GET', '/api/bootstrap')
check('G7 visitor bootstrap has no submissions', !(bootVis.json.data?.submissions || []).some((s) => s.id === subId))
const bootRev = await reviewer.c.call('GET', '/api/bootstrap')
check('B11 reviewer sees only assigned submission', (bootRev.json.data?.submissions || []).some((s) => s.id === subId))

// ---------- Scenario D: review → decision → release → revision ----------
const draftReview = await reviewer.c.call('POST', `/api/submissions/${subId}/reviews`, { overallScore: 6, recommendation: 'Borderline', comments: 'Draft notes in progress.', draft: true })
check('D1 draft review saved', draftReview.status === 201 && draftReview.json.status === 'draft', JSON.stringify(draftReview.json))
const review = await reviewer.c.call('POST', `/api/submissions/${subId}/reviews`, { overallScore: 8, criteriaScores: { Novelty: 4 }, recommendation: 'Weak Accept', comments: 'Solid work; please add a failure taxonomy table.' })
check('D2 reviewer submits review', review.status === 201 && review.json.status === 'submitted')
const authorBefore = await researcher.c.call('GET', '/api/bootstrap')
check('D3 author cannot see feedback before release', !(authorBefore.json.data?.reviews || []).some((r) => r.submissionId === subId))
const decision = await organizer.c.call('POST', `/api/submissions/${subId}/decision`, { decision: 'Revision Requested', note: 'Please add the failure taxonomy.', release: true })
check('D4 organizer requests revision (released)', decision.status === 200 && decision.json.status === 'Revision Requested', JSON.stringify(decision.json))
const revForm = new FormData()
revForm.set('file', new Blob([PDF], { type: 'application/pdf' }), 'revised.pdf')
const revision = await researcher.c.call('POST', `/api/submissions/${subId}/revision`, revForm, true)
check('D5 author uploads revision', revision.status === 200 && revision.json.status === 'Revised Submitted', JSON.stringify(revision.json))
const finalDecision = await organizer.c.call('POST', `/api/submissions/${subId}/decision`, { decision: 'Accepted', note: 'Accepted.', release: true })
check('D6 organizer accepts after revision', finalDecision.status === 200 && finalDecision.json.status === 'Accepted')
const authorAfter = await researcher.c.call('GET', '/api/bootstrap')
check('D7 author sees released decision + feedback', (authorAfter.json.data?.submissions || []).some((s) => s.id === subId && s.status === 'Accepted' && s.decisionReleased) && (authorAfter.json.data?.reviews || []).some((r) => r.submissionId === subId))
const resNotifs = await researcher.c.call('GET', '/api/notifications')
check('D8 researcher notified', (resNotifs.json.notifications || []).length > 0)

// ---------- Scenario E: visitor applies + AI screening + decision ----------
const visApp = await visitor.c.call('POST', `/api/conferences/${confId}/visitor-applications`, { answers: { 'What is your university?': 'E2E University, enrolled student' } })
check('E1 visitor applies (pending review)', visApp.status === 201 && visApp.json.application?.status === 'pending_review', JSON.stringify(visApp.json))
const vAppId = visApp.json.application?.id
const screen = await organizer.c.call('POST', `/api/visitor-applications/${vAppId}/ai-screen`, {})
check('E2 AI screening stored (advisory)', screen.status === 201 && Boolean(screen.json.screening?.recommendation) && screen.json.advisoryOnly === true, JSON.stringify(screen.json).slice(0, 300))
const afterScreen = await visitor.c.call('GET', `/api/visitor-applications/${vAppId}`)
check('E3 screening never auto-decides', afterScreen.json.application?.status === 'pending_review')
const approveApp = await organizer.c.call('PATCH', `/api/visitor-applications/${vAppId}`, { status: 'approved' })
check('E4 organizer approves visitor', approveApp.status === 200 && approveApp.json.application?.status === 'approved')
const visDash = await visitor.c.call('GET', '/api/dashboard')
check('E5 visitor sees approved application', visDash.json.visitor?.approved === 1)

// Invitation acceptance path (the invited reviewer accepts; event-specific only)
const revBoot = await reviewer.c.call('GET', '/api/bootstrap')
const invRow = (revBoot.json.data?.reviewerInvitations || []).find((i) => i.status === 'invited')
if (invRow) {
  const acceptInv = await reviewer.c.call('PATCH', `/api/reviewer-invitations/${invRow.id}`, { status: 'accepted' })
  check('B12 reviewer accepts invitation', acceptInv.status === 200 && acceptInv.json.invitation?.status === 'accepted', JSON.stringify(acceptInv.json))
} else {
  check('B12 reviewer invitation existed to accept', false, 'no invited invitation found')
}

// ---------- Paid event: payment is separate and never faked ----------
const paidRes = await organizer.c.call('POST', '/api/conferences', {
  organizationId: orgId, title: `E2E Paid ${run}`, visibility: 'public', registrationEnabled: true,
  registrationMode: 'approval', participationFeeCents: 5000, feeCurrency: 'USD', submissionsEnabled: false,
})
const paidId = paidRes.json.conference?.id
await organizer.c.call('POST', `/api/conferences/${paidId}/lifecycle`, { lifecycle: 'published' })
const paidApp = await visitor.c.call('POST', `/api/conferences/${paidId}/visitor-applications`, { answers: {} })
check('E6 paid application waits for payment', paidApp.status === 201 && paidApp.json.application?.status === 'pending_payment' && paidApp.json.application?.paymentStatus === 'unconfigured', JSON.stringify(paidApp.json))
const paidAppId = paidApp.json.application?.id
const payAttempt = await visitor.c.call('POST', `/api/visitor-applications/${paidAppId}/payment`, {})
check('E7 unconfigured payment honestly refused (never marked paid)', payAttempt.status === 503 && payAttempt.json.paymentStatus === 'unconfigured', JSON.stringify(payAttempt.json))
const approveUnpaid = await organizer.c.call('PATCH', `/api/visitor-applications/${paidAppId}`, { status: 'approved' })
check('E8 organizer cannot approve unpaid paid-registration', approveUnpaid.status === 400, `got ${approveUnpaid.status}`)

// ---------- Scenario F: private event ----------
const privRes = await organizer.c.call('POST', '/api/conferences', { organizationId: orgId, title: `E2E Private ${run}`, visibility: 'private', submissionsEnabled: true, registrationEnabled: true })
const privId = privRes.json.conference?.id
await organizer.c.call('POST', `/api/conferences/${privId}/lifecycle`, { lifecycle: 'published' })
const anonEvents = await client().call('GET', '/api/events')
check('F1 private event hidden publicly', !anonEvents.json.events?.some((e) => e.id === privId))
const visEvents = await visitor.c.call('GET', '/api/events')
check('F2 private event hidden from uninvited visitor', !visEvents.json.events?.some((e) => e.id === privId))
const inviteVis = await organizer.c.call('POST', `/api/conferences/${privId}/event-invitations`, { email: visEmail, invitedRole: 'visitor' })
check('F3 organizer invites visitor to private event', inviteVis.status === 201, JSON.stringify(inviteVis.json))
const visEvents2 = await visitor.c.call('GET', '/api/events')
check('F4 invited visitor can see private event', visEvents2.json.events?.some((e) => e.id === privId))
const privApp = await visitor.c.call('POST', `/api/conferences/${privId}/visitor-applications`, { answers: {} })
check('F5 invited visitor can apply to private event', privApp.status === 201 || privApp.status === 200, JSON.stringify(privApp.json))

console.log(failures === 0 ? `\nALL ${step} CHECKS PASSED` : `\n${failures} of ${step} CHECKS FAILED`)
process.exit(failures === 0 ? 0 : 1)

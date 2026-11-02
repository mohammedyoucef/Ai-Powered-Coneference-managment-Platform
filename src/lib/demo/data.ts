'use client'

import type { Conference, DemoData, Organization } from './types'
import { loadDemoData, saveDemoData, generateId } from './storage'
import { buildWebsiteConfig } from '@/lib/website/generator'

export function buildSampleData(): DemoData {
  const org: Organization = {
    id: generateId('org'),
    name: 'International Society for Intelligent Systems',
    slug: 'international-society-for-intelligent-systems',
    description: 'A scholarly society supporting research in intelligent systems, trustworthy AI, and applied computing.',
    type: 'Academic society',
    websiteUrl: 'https://example.org',
    contactEmail: 'contact@isis-example.org',
    createdAt: new Date().toISOString(),
  }

  const publishedConf: Conference = {
    id: generateId('conf'),
    organizationId: org.id,
    title: 'International Conference on Trustworthy AI & Cybersecurity 2027',
    slug: 'trustworthy-ai-cybersecurity-2027',
    shortDescription: 'Research on trustworthy artificial intelligence, cybersecurity, and resilient intelligent systems.',
    fullDescription:
      'The International Conference on Trustworthy AI & Cybersecurity brings together researchers, practitioners, and policy specialists working on dependable artificial intelligence and secure digital systems. The 2027 edition invites original work on verifiable AI, adversarial robustness, privacy-preserving learning, and secure infrastructure.',
    researchTopics: ['Trustworthy AI', 'Cybersecurity', 'Privacy-preserving machine learning', 'Adversarial robustness', 'AI governance', 'Secure systems'],
    startDate: '2027-05-18',
    endDate: '2027-05-20',
    submissionDeadline: '2027-01-15',
    venueOrFormat: 'Hybrid',
    city: 'Algiers',
    country: 'Algeria',
    contactEmail: 'tac2027@isis-example.org',
    language: 'English',
    submissionGuidelines:
      'Submit an anonymized PDF of up to 12 pages (excluding references) in the conference two-column format. All submissions undergo double-blind peer review. Accepted papers will be presented at the conference.',
    status: 'Published',
    lifecycle: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const draftConf: Conference = {
    id: generateId('conf'),
    organizationId: org.id,
    title: 'Workshop on Data Science for Sustainable Development',
    slug: 'data-science-sustainable-development',
    shortDescription: 'A focused workshop on data-driven approaches to sustainability challenges.',
    fullDescription: 'A one-day workshop exploring how data science supports sustainable development goals, from climate modelling to resource planning.',
    researchTopics: ['Data Science', 'Sustainability', 'Climate analytics'],
    startDate: '2027-09-10',
    endDate: '2027-09-10',
    submissionDeadline: '2027-06-01',
    venueOrFormat: 'Online',
    contactEmail: 'dssd@isis-example.org',
    language: 'English',
    status: 'Draft',
    lifecycle: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const publishedConfig = {
    ...buildWebsiteConfig(publishedConf, org, 'modern-academic'),
    published: true,
    publishedAt: new Date().toISOString(),
  }
  const draftConfig = { ...publishedConfig, id: generateId('site') }

  const now = new Date().toISOString()
  const sampleSubmission = {
    id: generateId('sub'),
    conferenceId: publishedConf.id,
    title: 'Verifiable Robustness Audits for Deployed Language Models',
    abstract: 'We present an audit framework that combines adversarial stress testing with verifiable evaluation logs to assess the robustness of deployed language models. Across three public benchmarks, the framework surfaces failure modes missed by static evaluation and produces reproducible audit trails for model operators.',
    authors: ['Lina Benali', 'Omar Haddad'],
    topics: ['Trustworthy AI', 'Adversarial robustness'],
    submittedBy: 'Lina Benali',
    status: 'Under Review' as const,
    assignedReviewer: 'Dr. Sara Mansouri',
    pdfFileName: 'benali-robustness-audits.pdf',
    pdfSize: 482000,
    pageCount: 11,
    extractedText: 'Sample extracted text: introduction, audit methodology, adversarial evaluation on three benchmarks, results, limitations, and conclusion. The original PDF bytes are not part of the sample dataset.',
    extractionNote: 'Sample record: the original PDF is not stored in this browser. Submit your own paper to test upload, preview, and extraction.',
    createdAt: now,
    updatedAt: now,
  }
  const sampleReview = {
    id: generateId('rev'),
    submissionId: sampleSubmission.id,
    reviewerName: 'Dr. Sara Mansouri',
    overallScore: 7,
    recommendation: 'Weak Accept' as const,
    comments: 'Clear audit methodology and reproducible logs. Please clarify how the stress-test prompts were sampled and add a failure taxonomy table.',
    createdAt: now,
    updatedAt: now,
  }

  return {
    organizations: [org],
    conferences: [publishedConf, draftConf],
    websiteConfigs: [draftConfig],
    publishedWebsiteConfigs: [publishedConfig],
    submissions: [sampleSubmission],
    reviews: [sampleReview],
    aiReviews: [],
    currentUser: null,
    members: [],
    invitations: [],
    assignments: [],
    notifications: [],
    users: [],
    activity: [],
    visitorApplications: [],
    payments: [],
    reviewerApplications: [],
    reviewerInvitations: [],
    eventInvitations: [],
    aiScreenings: [],
    announcements: [],
  }
}

/** Replace all demo data with the sample dataset. Returns the sample data. */
export function loadSampleData(): DemoData {
  const sample = buildSampleData()
  saveDemoData(sample)
  return sample
}

export function hasDemoData(): boolean {
  const data = loadDemoData()
  return data.organizations.length > 0 || data.conferences.length > 0
}

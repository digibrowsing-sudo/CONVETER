// Details that appear across the legal pages, in one place so they cannot drift
// apart. The DPDP Act and the IT Rules both require a named grievance officer
// with a published address and a stated response time (spec 15.2, 15.5).
//
// TODO before launch: replace the placeholder addresses with the real mailbox,
// and have a CA or lawyer review sections 15.2-15.5 of the spec as it says to.

export const SITE = {
  name: 'FileForge',
  url: 'https://fileforge.in',
  operator: 'Dev Mistry',
  operatorType: 'Sole proprietorship',
  jurisdiction: 'Maharashtra, India',
  lastUpdated: '7 August 2026',

  grievanceOfficer: {
    name: 'Dev Mistry',
    role: 'Grievance Officer',
    email: 'grievance@fileforge.in',
    responseSla: '15 days, and an acknowledgement within 72 hours',
  },

  contactEmail: 'hello@fileforge.in',
  privacyEmail: 'privacy@fileforge.in',
  dmcaEmail: 'dmca@fileforge.in',

  retention: {
    standardMinutes: 60,
    financeMinutes: 15,
    failedMinutes: 15,
    jobRecordDays: 30,
  },
} as const;

# CPIRD Item Bank

Next.js application for MCQ item authoring and a separate structured MEQ case bank.

## Development

Install with `npm ci`, then `npm run dev`. Run `npm run build` before deployment.
The browser client uses the existing Supabase publishable key; access is enforced by database policies.

## MEQ structure

MEQ cases contain ordered stages, per-stage minutes, scenarios, subquestions, scores, model answers and marking rubrics. Academic year and examination year are separate fields. Legacy short-answer items remain under the legacy MEQ tab.

Migration: `supabase/migrations/20260912035748_separate_meq_case_bank.sql` creates the separate authoring table and access policies. It has already been applied to the existing Supabase project; do not reapply manually.

## Exam delivery

Staff use Assign exams to create a draft round from a ready MCQ set or a structured MEQ case. Publishing validates and freezes the paper; it does not seed or import content. Students use the exam room, and staff can enter the same mode from the navigation.

New `delivery_manage` and `delivery_run` RPCs expose narrowly filtered data from the private `exam_delivery` schema. Tables have no direct API grants and RLS deliberately defaults to deny-all. The security advisor's informational "RLS enabled, no policy" notice is expected for these private RPC-only tables; see https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy. No service key is required in the browser.

Features: server deadlines, per-user attempt limits, access code/center eligibility, MCQ shuffling and optional no-backtracking, autosave/resume, bookmarks, submission review, server grading, score/answer release controls, staged MEQ with locked earlier/future stages, manual rubric-based MEQ grading, and CSV results.

All delivery migrations in `supabase/migrations/` have been applied in filename order. Do not reapply manually. Rollback-only checks in `tests/delivery.sql` and `tests/delivery-expiry.sql` cover admission, ownership, answer secrecy, stale revision rejection, submission, grading, and deadlines. They use temporary synthetic fixtures and existing auth identities; run against a staging database where possible.

Limits: no public guest links, certificate/email delivery, proctoring, image/media rendering, adaptive blueprint sampling, or new-engine item-analysis integration. Resume does not pause the timer. Expiry is finalized on the next student/examiner request; there is no background scheduler. Unsynced answers cannot be accepted after a deadline. No concurrent-user load test has been performed.

The old `Assign.js` and `ExamPortal.js` are retained as legacy source but are not mounted by the new UI. Existing legacy assignments/attempts were verified empty before switching the entry points.

## Content restriction

Only application code and database structure may be published. Importing old examinations requires a further explicit instruction from the user. No seed data is included. Local reference files and the design preview are excluded from both Git and Vercel uploads.

## Deployment

Existing repository: https://github.com/doctornon/cpird-item-bank
Existing production project: https://cpird-item-bank.vercel.app

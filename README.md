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

All delivery migrations in `supabase/migrations/` have been applied in filename order. Do not reapply manually.

**Schema drift warning.** The live database is ahead of this directory. Verified on 2026-09-18: `exam_delivery.manage` and `exam_delivery.run` in production carry question images (`stem_images`, option `image_url`/`image_width`), `pool_draw`, sample-item guards and `feedback_at` gating that no migration here records. Five further migrations (`20260912192833`…`20260912194326`) were applied from another working copy and never committed. Replaying this directory onto production would revert those fixes. Capture the real baseline with `supabase link --project-ref dainlpcqtirqoekrjtem && supabase db pull` before writing any migration that replaces an existing function; until then, add only additive migrations. Rollback-only checks in `tests/delivery.sql` and `tests/delivery-expiry.sql` cover admission, ownership, answer secrecy, stale revision rejection, submission, grading, and deadlines. They use temporary synthetic fixtures and existing auth identities; run against a staging database where possible.

Limits: no public guest links, certificate/email delivery, or proctoring. Images render for MCQ stems and options and for MEQ stages and questions. Resume does not pause the timer. Expiry is finalized on the next student/examiner request; there is no background scheduler. Unsynced answers cannot be accepted after a deadline. No concurrent-user load test has been performed.

The old `Assign.js` and `ExamPortal.js` are retained as legacy source but are not mounted by the new UI. Existing legacy assignments/attempts were verified empty before switching the entry points.

## Question images

MCQ stems and options may carry images, uploaded from the item editor into the `question-images` Supabase Storage bucket and rendered in preview, theater and live delivery. Migration `20260918000000_question_images_hardening.sql` closed a finding where `qimg_insert`/`qimg_update`/`qimg_delete` were permissive for every authenticated user with no ownership or role predicate, which let any signed-in account — students included, since the auth base is shared — overwrite or delete any question image. Writes now require `committee`/`item_writer` or super admin, edits and deletes are restricted to the uploader, and the bucket is capped at 5 MB and JPEG/PNG/WebP. The bucket held no objects when this was applied. `tests/question-images.sql` fails if the open policies or the missing limits ever return.

## MEQ images

Stages and questions carry an `images` array, edited through the shared `ImageField` and uploaded to the same `question-images` bucket; uploads are checked client-side against the limits the bucket enforces, and `validateMeq` rejects anything that is not an https URL along with out-of-range widths and unknown alignments — images stay structured data, never markup.

`exam_delivery.manage` copies stages wholesale, so images reached the frozen paper on their own, but `exam_delivery.run` rebuilt a whitelist object and dropped them before the paper reached the student. Because the live definition of `run` is far ahead of the copy in this directory, migration `20260918020000_meq_stage_images.sql` reads the real definition with `pg_get_functiondef` and replaces only the two fragments that need changing — each verified to occur exactly once — leaving every other byte intact and aborting if they are not found.

Applied 2026-09-19 and verified through the real `delivery_run('start')` path: a stage image and a per-question image both reach the student, model answers and rubrics still do not, and MCQ image handling is untouched. The function grew by exactly the 88 characters of the two insertions, so nothing else was rewritten.

## Item analysis

`bank_item_stats` existed and was read in three places but nothing ever wrote to it, so the set builder's quality ranking had no signal. Migration `20260918010000_item_analysis_engine.sql` adds `delivery_exam_id` (the legacy `exam_id` is a bigint and cannot hold a delivery uuid), `point_biserial`, and an `exam_delivery.exam_stats` table for whole-paper reliability. `exam_compute_item_stats(assignment_id)` computes, per item, facility, upper/lower-27% discrimination, corrected point-biserial and a full option breakdown including distractors nobody chose, then upserts them; it also stores mean, SD and KR-20 for the round. Demo rounds are refused so practice data cannot enter bank statistics. `exam_item_stats(assignment_id)` reads the result back. Staff trigger it from the analysis screen; there is no scheduler. `lib/itemStats.mjs` holds only the thresholds and wording so they can be unit-tested, while every number is computed once in the database. `tests/item-analysis.sql` checks the arithmetic against a fixture with hand-computed values (p, D, KR-20, and point-biserial cross-checked against the textbook formula); `tests/itemstats.test.mjs` covers the interpretation rules.

Sending a flagged item back for revision writes `bank_items.status = 'review'`, which RLS allows for committee, reviewer and super admin only — the button is hidden for analysts, who can read statistics but not change item state.

## Building a set from the blueprint

The set builder already had a per-cell magic fill, but it ranked candidates with statistics that were never computed, so in practice it picked blind. With `bank_item_stats` now populated, `lib/sampler.mjs` fills a whole paper in one pass: it scores every approved, non-sample item on facility and discrimination, refuses anything whose statistics suggest a miskey, penalises items used recently or used often, and caps how much of a paper a single author may supply. Cells with the fewest eligible candidates choose first, so a scarce ICD/group cell is not stripped by a broad one. Selection is seeded, so the same seed reproduces the same paper and 'regenerate' gives a different one on purpose. The proposal is shown for review — per cell, with the reason each item was chosen — before anything is written, and cells the bank cannot fill are reported as gaps to be authored rather than silently left short. `tests/sampler.test.mjs` covers ranking order, exclusion rules, exposure, scarcity ordering, author spread and determinism.

## Front-end loading

The app is a single client route that switches panels with one `tab` state, but every panel was imported statically, so opening the sign-in screen downloaded the whole staff application. Panels now load through `next/dynamic` when their tab is first opened, and `xlsx` — used only to build the import template and read an uploaded workbook — is imported inside the two handlers that need it. First Load JS for `/` went from 348 kB to 133 kB; `xlsx` sits in its own 408 kB chunk that only import users ever fetch. The single-route structure and the remembered-tab behaviour are unchanged.

## Exam registration and the centre dashboard

Exam dates live in `public.exam_schedule`, not in a JS file. They started as configuration, but a registration deadline that exists only in the browser is not a deadline — anyone calling the RPC directly could still sign up late — and holding the dates in two places invites exactly the drift this repository already suffers from. The table is therefore the single source for both the countdown and registration, and dates can be corrected without a deploy.

Students sign up themselves from the exam room. `exam_register` enforces, server side, that the round is active, that registration has not closed, and that the student's year matches the round; `exam_register_cancel` works only before the deadline, so the sign-up list stops moving once centres start preparing. Registration closes five days before each exam and the card warns during the final week. `exam_registrations` keeps cancelled rows rather than deleting them, and records the centre and year as they were at sign-up so a later change is visible rather than silently overwritten.

`exam_center_dashboard` gives academic staff and the centre's admin physician what they need to check before exam day: how many eligible students there are, who has signed up, who has not, and per-person flags for a missing student ID, a missing year, a year that does not match the round, or a centre change after sign-up. Staff can add or remove students of their own centre even after the deadline — that is the point of the override. Centre staff are locked to their own centre; only central roles may pass a `_center_id`. The printed site announcement now lists actual registrants instead of every student in the centre, because the sheet on the exam room door should match who is coming.

Access follows `profiles.is_center_admin` as well as the `center_staff` role, and an admin physician with no other role now counts as staff so the page is reachable at all. `tests/exam-registration.sql` covers the deadline, the year rule and the staff override; `tests/countdown.test.mjs` covers the deadline states and wording.

## Exam countdown and preparation guidance

Students see a live countdown to their upcoming rounds at the top of the exam portal, above the list of rounds open to them. Dates come from `public.exam_schedule` rather than from `exam_delivery.exams`, because delivery rounds are created close to the exam while candidates need the date months ahead. Every time carries an explicit +07:00 offset, so the countdown is correct on a device set to another timezone, and dates are rendered in Thai with the Buddhist year.

A round is filtered by the student's `profiles.year_level` (Y4/Y5/Y6/Cert); rounds with no year listed, and students with no year recorded, fall through to showing everything rather than nothing. A round stays on screen for twelve hours after it starts so the card does not vanish mid-exam. The ticking digits are hidden from screen readers and a minute-resolution summary is announced instead, so the countdown is not read out once a second.

The preparation-guidance module links out to the CPIRD Wise portal. Until a URL is set in `PREP_PORTAL.url` the card shows a 'being prepared' state instead of a button that goes nowhere. `tests/countdown.test.mjs` covers the arithmetic, the past/at-the-moment boundaries, filtering by year, and the Thai formatting.

## Content restriction

Only application code and database structure may be published. Importing old examinations requires a further explicit instruction from the user. No seed data is included. Local reference files and the design preview are excluded from both Git and Vercel uploads.

## Deployment

Existing repository: https://github.com/doctornon/cpird-item-bank
Existing production project: https://cpird-item-bank.vercel.app

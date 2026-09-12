# CPIRD Item Bank

Next.js application for MCQ item authoring and a separate structured MEQ case bank.

## Development

Install with `npm ci`, then `npm run dev`. Run `npm run build` before deployment.
The browser client uses the existing Supabase publishable key; access is enforced by database policies.

## MEQ structure

MEQ cases contain ordered stages, per-stage minutes, scenarios, subquestions, scores, model answers and marking rubrics. Academic year and examination year are separate fields. Legacy short-answer items remain under the legacy MEQ tab.

Migration: `supabase/migrations/20260912035748_separate_meq_case_bank.sql` creates the separate authoring table and access policies. It has already been applied to the existing Supabase project; do not reapply manually.

This is an authoring bank. Timed sequential student delivery, no-backtracking enforcement, and exam assignment integration for structured cases are not implemented yet.

## Content restriction

Only application code and database structure may be published. Importing old examinations requires a further explicit instruction from the user. No seed data is included. Local reference files and the design preview are excluded from both Git and Vercel uploads.

## Deployment

Existing repository: https://github.com/doctornon/cpird-item-bank
Existing production project: https://cpird-item-bank.vercel.app

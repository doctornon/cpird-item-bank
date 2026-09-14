// Creates (or reuses) email/password test users, assigns roles, signs them in,
// and writes a Playwright storageState per role that injects the Supabase session
// into localStorage — so specs start already logged in without touching Google OAuth.
//
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY  (service key is secret)
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const REF = URL ? new global.URL(URL).host.split('.')[0] : '';
const PW = 'Test!' + (process.env.TEST_PW_SALT || 'cpird1234');
const USERS = [
  { role: 'student', email: 'e2e.student@example.invalid', appRole: null,          profile: { role: 'student', student_id: 'E2E-001' } },
  { role: 'writer',  email: 'e2e.writer@example.invalid',  appRole: 'item_writer', profile: { role: 'teacher' } },
  { role: 'admin',   email: 'e2e.admin@example.invalid',   appRole: 'committee',   profile: { role: 'teacher' } },
];

export default async function globalSetup() {
  if (!URL || !ANON || !SVC) { console.warn('[e2e] SUPABASE_* env not set — skipping auth setup; specs will fail until provided'); return; }
  const admin = createClient(URL, SVC, { auth: { persistSession: false } });
  mkdirSync('e2e/.auth', { recursive: true });
  for (const u of USERS) {
    // ensure user
    let { data: created } = await admin.auth.admin.createUser({ email: u.email, password: PW, email_confirm: true });
    let uid = created?.user?.id;
    if (!uid) { const { data: list } = await admin.auth.admin.listUsers(); uid = list.users.find(x => x.email === u.email)?.id; }
    if (!uid) throw new Error('[e2e] could not create/find ' + u.email);
    // profile + app role + app access
    await admin.from('profiles').upsert({ id: uid, email: u.email, ...u.profile });
    await admin.from('exam_app_access').upsert({ user_id: uid, status: 'approved' });
    if (u.appRole) await admin.from('exam_item_roles').upsert({ user_id: uid, role: u.appRole, granted_by: uid });
    // sign in as the user to mint a real session
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: s, error } = await anon.auth.signInWithPassword({ email: u.email, password: PW });
    if (error) throw new Error('[e2e] signin failed for ' + u.email + ': ' + error.message);
    const token = JSON.stringify(s.session);
    writeFileSync(`e2e/.auth/${u.role}.json`, JSON.stringify({
      cookies: [],
      origins: [{ origin: process.env.BASE_URL || 'http://localhost:3000', localStorage: [{ name: `sb-${REF}-auth-token`, value: token }] }],
    }));
    console.log('[e2e] prepared', u.role);
  }
}

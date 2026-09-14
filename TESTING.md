# การทดสอบอัตโนมัติ (Test automation)

ระบบนี้ใช้แนวทาง **zero-dependency เป็นหลัก** — unit ใช้ `node --test` ในตัว, integration/contract
เป็นไฟล์ `.sql` ที่รันแบบ transaction ย้อนกลับ (ไม่ทิ้งข้อมูล) — และ E2E เสริมด้วย Playwright

| ระดับ | อยู่ที่ | รันด้วย | ต้องมีอะไร |
|---|---|---|---|
| 1. Unit | `tests/*.test.mjs` | `npm run test:unit` | Node 18+ (ไม่ต้องลงอะไร) |
| 2. Integration (RLS/RPC) | `tests/rls-roles.sql`, `tests/rpc-behavior.sql`, `tests/delivery*.sql` | `npm run test:db` | `psql` + `DATABASE_URL` |
| 3. Contract | `tests/contract.sql` | `npm run test:db` | `psql` + `DATABASE_URL` |
| 4. E2E | `e2e/*.spec.mjs` | `npm run test:e2e` | `@playwright/test` + คีย์ Supabase |

## 1) Unit — พร้อมใช้ทันที
```bash
npm run test:unit     # node --test tests/
```
ครอบคลุมฟังก์ชันบริสุทธิ์: การคำนวณ Table of Specifications (`lib/tos.mjs`), MEQ (`lib/meq.mjs`), blueprint coverage

## 2–3) Integration + Contract (ฐานข้อมูล)
ทุกไฟล์ `.sql` เป็น transaction ที่ **rollback/อ่านอย่างเดียว** — ปลอดภัย ไม่ทิ้งข้อมูล
```bash
export DATABASE_URL="postgresql://postgres:<pwd>@<host>:5432/postgres"   # ใช้ Supabase branch หรือ local ไม่ใช่ prod จริง
npm run test:db
```
ทดสอบขอบเขตสิทธิ์จริง (item_writer เห็นเฉพาะข้อตัวเอง, นศพ.เข้าคลังไม่ได้, จนท.ศูนย์คนนอกถูกกั้น),
พฤติกรรม RPC (สมัคร→ได้สิทธิ์ item_writer + บันทึกความยินยอม) และ contract (RPC/คอลัมน์ที่ frontend เรียกมีอยู่จริง)

> แนะนำ: ใช้ **Supabase Branch** (หรือ `supabase start` แบบ local) เป็น DB สำหรับทดสอบ เพื่อความปลอดภัยสูงสุด

## 4) E2E (Playwright)
ข้าม Google login ด้วยการฉีด session ลง localStorage (ดู `e2e/global-setup.mjs`) — สร้างผู้ใช้ทดสอบผ่าน service key
```bash
npm i && npx playwright install chromium
export BASE_URL="https://cpird-item-bank.vercel.app"   # หรือ http://localhost:3000
export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=...   # service key = ความลับ
npm run test:e2e
```
สโคป smoke test ต่อ role (นศพ. / ผู้ออกข้อสอบ / admin) ว่า landing พาไปหน้าที่ถูกต้องและไม่เห็นเมนูที่ไม่ควรเห็น

## CI (GitHub Actions)
`.github/workflows/test.yml` — unit รันทุก push/PR; db และ e2e เปิดใช้เมื่อกำหนด repo variable
`RUN_DB_TESTS=true` / `RUN_E2E_TESTS=true` และใส่ secrets (`DATABASE_URL`, `SUPABASE_*`, `E2E_BASE_URL`)

## ความปลอดภัยของการทดสอบ
- ไฟล์ `.sql` ทุกไฟล์ห่อด้วย `begin … rollback` หรืออ่านอย่างเดียว → รันแล้วไม่ทิ้งข้อมูล
- E2E ใช้บัญชีทดสอบเฉพาะ (`e2e.*@example.invalid`) แยกจากผู้ใช้จริง
- ไม่ควรชี้ `DATABASE_URL`/E2E ไปที่ production ที่มีข้อมูลจริง — ใช้ branch/staging

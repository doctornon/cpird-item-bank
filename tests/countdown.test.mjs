import test from "node:test";
import assert from "node:assert/strict";
import {
  timeLeft, upcomingExams, examsForStudent, thaiDateTime,
  countdownLabel, urgency, KEEP_AFTER_START, yearNumber,
  fromRow, registrationState, deadlineLabel, DEADLINE_WARN_DAYS,
} from "../lib/countdown.mjs";
import { PREP_PORTAL } from "../lib/examSchedule.mjs";

const MEQ = "2026-12-12T12:00:00+07:00";
const at = (iso) => new Date(iso).getTime();

test("counts down to a target in Thai time regardless of the device timezone", () => {
  const left = timeLeft(MEQ, at("2026-12-10T12:00:00+07:00"));
  assert.equal(left.days, 2);
  assert.equal(left.hours, 0);
  assert.equal(left.past, false);
});

test("splits the remainder into days, hours, minutes and seconds", () => {
  const left = timeLeft(MEQ, at("2026-12-09T09:30:15+07:00"));
  assert.deepEqual(
    { d: left.days, h: left.hours, m: left.minutes, s: left.seconds },
    { d: 3, h: 2, m: 29, s: 45 },
  );
});

test("a target that has passed is reported as past, not as a negative countdown", () => {
  const left = timeLeft(MEQ, at("2026-12-12T12:00:01+07:00"));
  assert.equal(left.past, true);
  assert.ok(left.total < 0);
  assert.ok(left.days >= 0 && left.hours >= 0);
});

test("the exact moment of the exam counts as started", () => {
  assert.equal(timeLeft(MEQ, at(MEQ)).past, true);
});

test("an unparseable date yields null instead of NaN on screen", () => {
  assert.equal(timeLeft("not-a-date"), null);
  assert.equal(countdownLabel(null), "");
});

const schedule = [
  { key: "mcq", at: "2027-02-13T09:00:00+07:00", years: [4, 5] },
  { key: "meq", at: MEQ, years: [] },
  { key: "old", at: "2026-01-01T09:00:00+07:00", years: [] },
];

test("upcoming exams are sorted soonest first and past ones drop off", () => {
  const list = upcomingExams(schedule, at("2026-11-01T00:00:00+07:00"));
  assert.deepEqual(list.map((e) => e.key), ["meq", "mcq"]);
});

test("an exam stays on screen during the day it is held, then disappears", () => {
  const during = at("2026-12-12T18:00:00+07:00");
  assert.ok(upcomingExams(schedule, during).some((e) => e.key === "meq"));
  const after = at(MEQ) + KEEP_AFTER_START + 1000;
  assert.ok(!upcomingExams(schedule, after).some((e) => e.key === "meq"));
});

test("students only see the rounds their year sits for", () => {
  const now = at("2026-11-01T00:00:00+07:00");
  assert.deepEqual(examsForStudent(schedule, 4, now).map((e) => e.key), ["meq", "mcq"]);
  assert.deepEqual(examsForStudent(schedule, 6, now).map((e) => e.key), ["meq"]);
});

test("a student with no recorded year sees every round rather than none", () => {
  const now = at("2026-11-01T00:00:00+07:00");
  assert.deepEqual(examsForStudent(schedule, null, now).map((e) => e.key), ["meq", "mcq"]);
});

test("dates read in Thai with the Buddhist year and the right weekday", () => {
  assert.equal(thaiDateTime(MEQ), "วันเสาร์ที่ 12 ธันวาคม 2569 เวลา 12.00 น.");
  assert.equal(thaiDateTime("2027-02-13T09:00:00+07:00"), "วันเสาร์ที่ 13 กุมภาพันธ์ 2570 เวลา 09.00 น.");
});

test("the spoken label stays at minute resolution so it is not read out every second", () => {
  assert.equal(countdownLabel(timeLeft(MEQ, at("2026-12-10T12:00:00+07:00"))), "เหลืออีก 2 วัน 0 ชั่วโมง");
  assert.equal(countdownLabel(timeLeft(MEQ, at("2026-12-12T09:30:00+07:00"))), "เหลืออีก 2 ชั่วโมง 30 นาที");
  assert.equal(countdownLabel(timeLeft(MEQ, at("2026-12-12T11:45:00+07:00"))), "เหลืออีก 15 นาที");
  assert.equal(countdownLabel(timeLeft(MEQ, at("2026-12-12T13:00:00+07:00"))), "ถึงเวลาสอบแล้ว");
});

test("urgency rises as the exam approaches", () => {
  assert.equal(urgency(timeLeft(MEQ, at("2026-10-01T12:00:00+07:00"))), "far");
  assert.equal(urgency(timeLeft(MEQ, at("2026-12-08T12:00:00+07:00"))), "soon");
  assert.equal(urgency(timeLeft(MEQ, at("2026-12-12T06:00:00+07:00"))), "today");
  assert.equal(urgency(timeLeft(MEQ, at("2026-12-12T12:30:00+07:00"))), "now");
});

test("the stored year level maps to a number, and non-year students see everything", () => {
  const now = at("2026-11-01T00:00:00+07:00");
  assert.equal(yearNumber("Y4"), 4);
  assert.equal(yearNumber("Y6"), 6);
  assert.equal(yearNumber("Cert"), null);
  assert.equal(yearNumber(null), null);
  assert.equal(yearNumber(5), 5);
  assert.deepEqual(examsForStudent(schedule, "Y5", now).map((e) => e.key), ["meq", "mcq"]);
  assert.deepEqual(examsForStudent(schedule, "Y6", now).map((e) => e.key), ["meq"]);
  assert.deepEqual(examsForStudent(schedule, "Cert", now).map((e) => e.key), ["meq", "mcq"]);
});

test("the preparation portal link is an https URL so the card renders a button", () => {
  assert.match(PREP_PORTAL.url, /^https:\/\//);
});

// ── การรับสมัครและเดดไลน์ ────────────────────────────────────────────────
const row = {
  exam_key: "meq-2569", kind: "MEQ", title: "สอบ MEQ",
  starts_at: MEQ, years: [4], where_text: "ศูนย์แพทย์",
  register_closes_at: "2026-12-07T12:00:00+07:00",
};

test("a schedule row from the database becomes the shape the cards render", () => {
  const e = fromRow(row);
  assert.equal(e.key, "meq-2569");
  assert.equal(e.at, MEQ);
  assert.equal(e.closesAt, row.register_closes_at);
  assert.deepEqual(e.years, [4]);
  assert.equal(e.where, "ศูนย์แพทย์");
});

test("years defaults to an empty list when the column is null", () => {
  assert.deepEqual(fromRow({ ...row, years: null }).years, []);
});

test("registration is open before the deadline and shut after it", () => {
  const e = fromRow(row);
  const before = registrationState(e, at("2026-12-01T00:00:00+07:00"), false);
  assert.equal(before.closed, false);
  assert.equal(before.canRegister, true);
  assert.equal(before.canCancel, false);

  const after = registrationState(e, at("2026-12-07T12:00:01+07:00"), false);
  assert.equal(after.closed, true);
  assert.equal(after.canRegister, false);
});

test("someone already registered is offered cancel, not register", () => {
  const e = fromRow(row);
  const s = registrationState(e, at("2026-12-01T00:00:00+07:00"), true);
  assert.equal(s.canRegister, false);
  assert.equal(s.canCancel, true);
  assert.equal(s.warn, false, "คนที่สมัครแล้วไม่ต้องถูกเร่ง");
});

test("cancelling is no longer offered once the deadline passes", () => {
  const s = registrationState(fromRow(row), at("2026-12-08T00:00:00+07:00"), true);
  assert.equal(s.canCancel, false);
  assert.equal(s.closed, true);
});

test("the deadline warning appears only in the last week, and only if not signed up", () => {
  const e = fromRow(row);
  const far = registrationState(e, at("2026-11-20T12:00:00+07:00"), false);
  assert.equal(far.warn, false);
  const near = registrationState(e, at("2026-12-05T12:00:00+07:00"), false);
  assert.equal(near.warn, true);
  assert.ok(near.left.days < DEADLINE_WARN_DAYS);
});

test("a round with no deadline recorded still allows registering", () => {
  const s = registrationState(fromRow({ ...row, register_closes_at: null }), at("2026-12-01T00:00:00+07:00"), false);
  assert.equal(s.closed, false);
  assert.equal(s.canRegister, true);
});

test("the deadline reads in days, then hours, then minutes, then as closed", () => {
  const e = fromRow(row);
  const say = (iso, reg = false) => deadlineLabel(registrationState(e, at(iso), reg));
  assert.equal(say("2026-12-04T12:00:00+07:00"), "ปิดรับสมัครในอีก 3 วัน");
  assert.equal(say("2026-12-07T09:30:00+07:00"), "ปิดรับสมัครในอีก 2 ชั่วโมง");
  assert.equal(say("2026-12-07T11:45:00+07:00"), "ปิดรับสมัครในอีก 15 นาที");
  assert.equal(say("2026-12-08T00:00:00+07:00"), "ปิดรับสมัครแล้ว");
  assert.equal(say("2026-12-08T00:00:00+07:00", true), "ปิดรับสมัครแล้ว · คุณสมัครไว้แล้ว");
});

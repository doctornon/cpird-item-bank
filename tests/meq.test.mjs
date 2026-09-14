import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMeq, reviewMeq, validateMeq } from '../lib/meq.mjs';

const doc = { stages: [
  { minutes: 5, questions: [{ points: 2 }] },
  { minutes: 10, questions: [{ points: 3 }, { points: 1 }] },
] };

test('summarizeMeq counts stages, questions, minutes and points', () => {
  assert.deepEqual(summarizeMeq(doc), { stages: 2, questions: 3, minutes: 15, points: 6 });
});

test('summarizeMeq tolerates an empty document', () => {
  assert.deepEqual(summarizeMeq({}), { stages: 0, questions: 0, minutes: 0, points: 0 });
});

test('reviewMeq flags per-stage and cover mismatches, silent when consistent', () => {
  assert.deepEqual(reviewMeq(doc), []);
  const bad = { sourcePoints: 99, sourceMinutes: 99, stages: [{ minutes: 5, sourcePoints: 5, questions: [{ points: 2 }] }] };
  const w = reviewMeq(bad);
  assert.ok(w.length >= 2);
  assert.ok(w.some(m => m.includes('ตอนที่ 1')));
});

test('validateMeq rejects the common bad inputs', () => {
  assert.match(validateMeq({ title: '' }), /ชื่อเคส/);
  assert.match(validateMeq({ title: 'x', academic_year: 20 }), /ปีการศึกษา/);
  assert.match(validateMeq({ title: 'x', academic_year: 2568, document: { stages: [] } }), /อย่างน้อย 1 ตอน/);
  assert.match(validateMeq({ title: 'x', academic_year: 2568, document: { stages: [{ scenario: '', minutes: 5, questions: [{ prompt: 'q', points: 1 }] }] } }), /ข้อมูลผู้ป่วย/);
});

test('validateMeq passes a complete case (empty string = ok)', () => {
  const ok = { title: 'เคสทดสอบ', academic_year: 2568, exam_year: 2569, document: { stages: [ { scenario: 'ผู้ป่วย...', minutes: 5, questions: [{ prompt: 'ถาม?', points: 2 }] } ] } };
  assert.equal(validateMeq(ok), '');
});

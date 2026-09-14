import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeqMarkdown } from '../lib/meqMarkdown.mjs';
import { validateMeq, summarizeMeq, reviewMeq } from '../lib/meq.mjs';

// A compact two-set sample in the exact ศรว. paper shape the importer must handle.
const SAMPLE = `# ข้อสอบอัตนัยประยุกต์ (MEQ) ปีการศึกษา 2568

## คำแนะนำการทำข้อสอบ
1. ห้ามย้อนกลับ

---

# ชุดที่ 1

### หน้าปก
เวลา **15 นาที** · คะแนนเต็ม **50 คะแนน**

---

### ชุดที่ 1 · หน้าที่ 1

**⏱ ตอนที่ 1 (2 คำถาม 8 นาที รวม 30 คะแนน)**

> **ชื่อ-นามสกุล** ____  **เลขทะเบียน** ____

**โจทย์**

> ชายไทย อายุ 40 ปี มาด้วยอาเจียนเป็นเลือด
> BP 80/50 PR 120

**คำถามข้อที่ 1** จงระบุปัญหาของผู้ป่วย **(10 คะแนน)**

\`\`\`text
\`\`\`

**คำถามข้อที่ 2** จงบอกการรักษา**เบื้องต้น** **(20 คะแนน)**

\`\`\`text
\`\`\`

---

### ชุดที่ 1 · หน้าที่ 2

**⏱ ตอนที่ 2 (1 คำถาม 7 นาที รวม 20 คะแนน)**

**โจทย์**

> ผู้ป่วยรายเดิม หลังได้สารน้ำ อาการคงที่

**คำถามข้อที่ 3** จงให้การวินิจฉัย **(20 คะแนน)**

\`\`\`text
\`\`\`

---

# ชุดที่ 2

### ชุดที่ 2 · หน้าที่ 1

**⏱ ตอนที่ 1 (1 คำถาม 5 นาที รวม 10 คะแนน)**

**โจทย์**

> หญิงไทย อายุ 25 ปี มาด้วยไข้

**คำถามข้อที่ 1** จงบอกการตรวจเพิ่มเติม **(10 คะแนน)**

\`\`\`text
\`\`\`
`;

test('parses each ชุด into a separate case', () => {
  const cases = parseMeqMarkdown(SAMPLE);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].academic_year, 2568);
  assert.equal(cases[0].exam_year, 2569); // defaults to academic_year + 1
});

test('extracts stages, minutes, questions and points', () => {
  const [c1] = parseMeqMarkdown(SAMPLE);
  const t = summarizeMeq(c1.document);
  assert.equal(t.stages, 2);
  assert.equal(t.questions, 3);
  assert.equal(t.minutes, 15);   // 8 + 7
  assert.equal(t.points, 50);    // 10 + 20 + 20
  const s1 = c1.document.stages[0];
  assert.equal(s1.minutes, 8);
  assert.equal(s1.questions[0].points, 10);
  assert.equal(s1.questions[1].points, 20);
});

test('captures the scenario blockquote and strips bold from prompts', () => {
  const [c1] = parseMeqMarkdown(SAMPLE);
  const s1 = c1.document.stages[0];
  assert.match(s1.scenario, /อาเจียนเป็นเลือด/);
  assert.match(s1.scenario, /BP 80\/50/);
  // ** markers removed, inner text kept
  assert.equal(s1.questions[1].prompt, 'จงบอกการรักษาเบื้องต้น');
  assert.ok(!s1.questions[1].prompt.includes('*'));
});

test('produced cases pass validateMeq and raise no source-mismatch warnings', () => {
  for (const c of parseMeqMarkdown(SAMPLE)) {
    assert.equal(validateMeq(c), '');
    assert.deepEqual(reviewMeq(c.document), []);
  }
});

test('question numbering is continuous within a case', () => {
  const [c1] = parseMeqMarkdown(SAMPLE);
  const nums = c1.document.stages.flatMap(s => s.questions.map(q => q.number));
  assert.deepEqual(nums, [1, 2, 3]);
});

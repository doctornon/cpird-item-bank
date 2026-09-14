// Parser: ศรว.-style MEQ markdown paper -> meq_cases rows.
// Format (per the Saraburi MEQ formative papers):
//   # <doc title ... ปีการศึกษา NNNN>        (document header; academic year lives here)
//   # ชุดที่ N                                (each = one meq_case)
//     ### หน้าปก                             (cover: total time/score — optional, used for QA)
//     ### ชุดที่ N · หน้าที่ M               (a page = a stage)
//     **⏱ ตอนที่ M (X คำถาม Y นาที รวม Z คะแนน)**   (stage header: minutes Y, count X, points Z)
//     **โจทย์**                              (scenario follows as > blockquote lines)
//     **คำถามข้อที่ K** <prompt> **(P คะแนน)**       (a question)
//     ```text ... ```                        (blank answer box — ignored)
// Model answers/rubric are absent in the question paper; they stay empty and can be filled later.

const uuid = () => (globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));

const stripBold = s => s.replace(/\*\*/g, '').trim();
// digits: accept Thai numerals too
const TH = { '๐':'0','๑':'1','๒':'2','๓':'3','๔':'4','๕':'5','๖':'6','๗':'7','๘':'8','๙':'9' };
const toNum = s => { if (s == null) return NaN; const t = String(s).replace(/[๐-๙]/g, d => TH[d]); const m = t.match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : NaN; };

// Pull the last "(P คะแนน)" occurrence out of a question line; return {prompt, points}.
function splitPoints(line) {
  let points = null, prompt = line;
  const re = /\(\s*([\d๐-๙.]+)\s*คะแนน\s*\)/g;
  let m, last = null;
  while ((m = re.exec(line))) last = m;
  if (last) { points = toNum(last[1]); prompt = (line.slice(0, last.index) + line.slice(last.index + last[0].length)); }
  return { prompt: stripBold(prompt), points: points == null ? 0 : points };
}

// Collect the scenario: consecutive blockquote (">") lines right after **โจทย์**.
function collectScenario(lines, from) {
  const out = []; let i = from;
  // skip blank lines
  while (i < lines.length && !lines[i].trim()) i++;
  for (; i < lines.length; i++) {
    const t = lines[i];
    if (/^\s*>/.test(t)) { out.push(t.replace(/^\s*>\s?/, '').replace(/\s+$/, '')); continue; }
    if (!t.trim()) { if (out.length && lines[i + 1] && /^\s*>/.test(lines[i + 1])) { out.push(''); continue; } break; }
    break;
  }
  return { scenario: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), next: i };
}

// Parse one case body (text between two "# ชุดที่" headers) into stages.
function parseStages(body) {
  const lines = body.split('\n');
  const stages = [];
  let cur = null;              // current stage
  let qNo = 0;                 // running question number within the case
  let inQuestions = false;     // have we passed **โจทย์** yet for this stage
  let coverMinutes = null, coverPoints = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // cover totals (only before first stage)
    if (!cur) {
      const mv = line.match(/เวลา\s*\*\*([\d๐-๙]+)\s*นาที/); if (mv) coverMinutes = toNum(mv[1]);
      const mp = line.match(/คะแนนเต็ม\s*\*\*([\d๐-๙]+)\s*คะแนน/); if (mp) coverPoints = toNum(mp[1]);
    }

    // stage header: **⏱ ตอนที่ M (X คำถาม Y นาที รวม Z คะแนน)**
    const sh = line.match(/^\*\*\s*⏱\s*ตอนที่\s*([\d๐-๙]+)\s*\(([^)]*)\)/);
    if (sh) {
      const inside = sh[2];
      const min = inside.match(/([\d๐-๙]+)\s*นาที/);
      const cnt = inside.match(/([\d๐-๙]+)\s*คำถาม/);
      const pts = inside.match(/รวม\s*([\d๐-๙]+)\s*คะแนน/);
      cur = {
        id: uuid(),
        title: 'ตอนที่ ' + toNum(sh[1]),
        scenario: '',
        minutes: min ? toNum(min[1]) : 5,
        questions: [],
        sourceQuestionCount: cnt ? toNum(cnt[1]) : null,
        sourcePoints: pts ? toNum(pts[1]) : null,
      };
      stages.push(cur);
      inQuestions = false;
      continue;
    }
    if (!cur) continue;

    // scenario marker
    if (/^\*\*\s*โจทย์\s*\*\*/.test(line)) {
      const { scenario, next } = collectScenario(lines, i + 1);
      cur.scenario = scenario;
      inQuestions = true;
      i = next - 1;
      continue;
    }

    // question: **คำถามข้อที่ K** ... **(P คะแนน)**
    const qh = line.match(/^\*\*\s*คำถามข้อที่\s*([\d๐-๙]+)\s*\*\*(.*)$/);
    if (qh) {
      qNo++;
      const { prompt, points } = splitPoints(qh[2]);
      cur.questions.push({ id: uuid(), number: toNum(qh[1]) || qNo, prompt: prompt.trim(), points, modelAnswer: '', rubric: '' });
      continue;
    }
  }

  // If a stage never got a **โจทย์** (rare), leave scenario as the stage title placeholder so validation can flag it.
  return { stages, coverMinutes, coverPoints };
}

export function parseMeqMarkdown(text, opts = {}) {
  const src = String(text).replace(/\r\n?/g, '\n');
  // document-level academic year
  const ayMatch = src.match(/ปีการศึกษา\s*([\d๐-๙]{4})/);
  const academicYear = Number(opts.academicYear) || (ayMatch ? toNum(ayMatch[1]) : null);
  const examYear = Number(opts.examYear) || (academicYear ? academicYear + 1 : null);
  const docLabel = (() => { const h = src.match(/^#\s+([^\n#].*)$/m); return h ? stripBold(h[1]) : 'MEQ'; })();

  // split into cases by "# ชุดที่ N"
  const re = /^#\s+ชุดที่\s*([\d๐-๙]+)\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(src))) marks.push({ n: toNum(m[1]), start: m.index, headEnd: re.lastIndex });
  const cases = [];
  for (let k = 0; k < marks.length; k++) {
    const body = src.slice(marks[k].headEnd, k + 1 < marks.length ? marks[k + 1].start : src.length);
    const { stages, coverMinutes, coverPoints } = parseStages(body);
    if (!stages.length) continue;
    cases.push({
      title: `MEQ ปีการศึกษา ${academicYear ?? '—'} ชุดที่ ${marks[k].n}`,
      academic_year: academicYear,
      exam_year: examYear,
      document: {
        version: 1,
        instructions: 'เปิดทีละตอนตามเวลา หมดเวลาจะล็อกคำตอบและเปิดตอนถัดไป ห้ามอ่านล่วงหน้าและห้ามย้อนกลับแก้ไข',
        competency: '',
        taxonomy: {},
        source: docLabel,
        sourceMinutes: coverMinutes,
        sourcePoints: coverPoints,
        stages,
      },
    });
  }
  return cases;
}

export default parseMeqMarkdown;

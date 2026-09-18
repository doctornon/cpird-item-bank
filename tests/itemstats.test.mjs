import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyItem,
  deadDistractors,
  omitRate,
  reliabilityLabel,
  MIN_N,
} from "../lib/itemStats.mjs";

const stat = (over = {}) => ({
  n: 100,
  p_value: 0.6,
  discrimination: 0.35,
  point_biserial: 0.4,
  distractors: {
    omitted: 0,
    options: [
      { label: "A", correct: true, n: 60 },
      { label: "B", correct: false, n: 20 },
      { label: "C", correct: false, n: 20 },
    ],
  },
  ...over,
});

test("a healthy item is kept with no flags", () => {
  const r = classifyItem(stat());
  assert.equal(r.verdict, "keep");
  assert.equal(r.severity, "ok");
  assert.deepEqual(r.flags, []);
  assert.equal(r.tentative, false);
});

test("negative discrimination is treated as a likely miskey and stops the item", () => {
  const r = classifyItem(stat({ discrimination: -0.15 }));
  assert.equal(r.verdict, "retire");
  assert.equal(r.severity, "stop");
  assert.ok(r.flags.some((f) => f.code === "miskeyed"));
  // ค่าติดลบต้องไม่ถูกนับซ้ำเป็นเพียง "อำนาจจำแนกต่ำ"
  assert.ok(!r.flags.some((f) => f.code === "low_discrimination"));
});

test("negative point-biserial also stops the item", () => {
  const r = classifyItem(stat({ point_biserial: -0.05 }));
  assert.equal(r.verdict, "retire");
  assert.ok(r.flags.some((f) => f.code === "negative_rpb"));
  assert.ok(!r.flags.some((f) => f.code === "low_rpb"));
});

test("a very hard item with weak discrimination is sent for review", () => {
  const r = classifyItem(stat({ p_value: 0.18, discrimination: 0.05, point_biserial: 0.1 }));
  assert.equal(r.verdict, "review");
  assert.deepEqual(
    r.flags.map((f) => f.code).sort(),
    ["low_discrimination", "low_rpb", "too_hard"],
  );
});

test("a very easy item is flagged even when it discriminates", () => {
  const r = classifyItem(stat({ p_value: 0.93 }));
  assert.equal(r.verdict, "review");
  assert.ok(r.flags.some((f) => f.code === "too_easy"));
});

test("boundary values are inclusive on the acceptable side", () => {
  assert.equal(classifyItem(stat({ p_value: 0.3 })).verdict, "keep");
  assert.equal(classifyItem(stat({ p_value: 0.85 })).verdict, "keep");
  assert.equal(classifyItem(stat({ discrimination: 0.2 })).verdict, "keep");
  assert.equal(classifyItem(stat({ point_biserial: 0.2 })).verdict, "keep");
});

test("a distractor nobody chose is reported by label", () => {
  const d = {
    omitted: 0,
    options: [
      { label: "A", correct: true, n: 80 },
      { label: "B", correct: false, n: 20 },
      { label: "C", correct: false, n: 0 },
      { label: "D", correct: false, n: 0 },
    ],
  };
  assert.deepEqual(deadDistractors(d), ["C", "D"]);
  const r = classifyItem(stat({ distractors: d }));
  assert.ok(r.flags.some((f) => f.code === "dead_distractor" && f.detail.includes("C, D")));
});

test("the correct option is never counted as a dead distractor", () => {
  const d = { omitted: 0, options: [{ label: "A", correct: true, n: 0 }, { label: "B", correct: false, n: 50 }] };
  assert.deepEqual(deadDistractors(d), []);
});

test("a high omit rate is recorded as information, not a reason to pull the item", () => {
  const d = { omitted: 30, options: [{ label: "A", correct: true, n: 40 }, { label: "B", correct: false, n: 30 }] };
  assert.equal(omitRate(d, 100), 0.3);
  const r = classifyItem(stat({ distractors: d }));
  assert.equal(r.severity, "info");
  assert.equal(r.verdict, "keep");
  assert.ok(r.flags.some((f) => f.code === "high_omit"));
});

test("a small cohort is marked tentative so weak stats are not over-read", () => {
  assert.equal(classifyItem(stat({ n: MIN_N - 1 })).tentative, true);
  assert.equal(classifyItem(stat({ n: MIN_N })).tentative, false);
});

test("missing statistics produce no flags rather than false alarms", () => {
  const r = classifyItem({ n: 0, p_value: null, discrimination: null, point_biserial: null, distractors: null });
  assert.deepEqual(r.flags, []);
  assert.equal(r.verdict, "keep");
  assert.equal(r.tentative, true);
});

test("reliability bands follow the usual KR-20 reading", () => {
  assert.equal(reliabilityLabel(0.85).cls, "approved");
  assert.equal(reliabilityLabel(0.72).cls, "approved");
  assert.equal(reliabilityLabel(0.65).cls, "review");
  assert.equal(reliabilityLabel(0.4).cls, "retired");
  assert.equal(reliabilityLabel(null).cls, "muted");
});

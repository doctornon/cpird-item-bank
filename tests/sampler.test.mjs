import test from "node:test";
import assert from "node:assert/strict";
import { proposeSet, qualityScore, exposurePenalty, DEFAULTS } from "../lib/sampler.mjs";

const NOW = Date.parse("2026-09-18T00:00:00Z");
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

const item = (id, over = {}) => ({
  id,
  status: "approved",
  is_sample: false,
  icd_system: 9,
  nl_group: 2,
  author_id: "author-" + id,
  use_count: 0,
  last_used_at: null,
  ...over,
});

const good = { n: 200, p_value: 0.6, discrimination: 0.4, point_biserial: 0.4, distractors: null };
const weak = { n: 200, p_value: 0.95, discrimination: 0.05, point_biserial: 0.05, distractors: null };
const miskeyed = { n: 200, p_value: 0.3, discrimination: -0.3, point_biserial: -0.2, distractors: null };

const cell = (key, need, pred = () => true) => ({ key, label: key, need, pred });

test("fills a cell from the pool and reports no gap", () => {
  const r = proposeSet({
    pool: [item(1), item(2), item(3)],
    stats: {},
    targets: [cell("cardio", 2)],
    now: NOW,
  });
  assert.equal(r.filled, 2);
  assert.equal(r.need, 2);
  assert.deepEqual(r.gaps, []);
  assert.equal(r.complete, true);
});

test("reports exactly how many items a cell is short of", () => {
  const r = proposeSet({ pool: [item(1)], stats: {}, targets: [cell("rare", 4)], now: NOW });
  assert.equal(r.filled, 1);
  assert.deepEqual(r.gaps, [{ key: "rare", label: "rare", need: 4, got: 1, short: 3 }]);
  assert.equal(r.complete, false);
});

test("items with proven statistics outrank untested ones, which outrank weak ones", () => {
  const r = proposeSet({
    pool: [item(1), item(2), item(3)],
    stats: { 1: weak, 3: good },
    targets: [cell("x", 2)],
    now: NOW,
  });
  assert.deepEqual(r.picks.map((p) => p.id), [3, 2]);
  assert.equal(r.picks[0].reason, "สถิติดี");
  assert.equal(r.picks[1].reason, "ยังไม่เคยใช้สอบ");
});

test("an item whose discrimination is negative is never proposed", () => {
  const r = proposeSet({
    pool: [item(1), item(2)],
    stats: { 1: miskeyed },
    targets: [cell("x", 2)],
    now: NOW,
  });
  assert.deepEqual(r.picks.map((p) => p.id), [2]);
  assert.equal(r.gaps[0].short, 1);
});

test("recently used items lose to rested ones of equal quality", () => {
  const r = proposeSet({
    pool: [item(1, { last_used_at: ago(30) }), item(2, { last_used_at: ago(800) })],
    stats: { 1: good, 2: good },
    targets: [cell("x", 1)],
    now: NOW,
  });
  assert.deepEqual(r.picks.map((p) => p.id), [2]);
});

test("heavily reused items are pushed down even when never recently used", () => {
  const r = proposeSet({
    pool: [item(1, { use_count: 9 }), item(2, { use_count: 0 })],
    stats: { 1: good, 2: good },
    targets: [cell("x", 1)],
    now: NOW,
  });
  assert.deepEqual(r.picks.map((p) => p.id), [2]);
});

test("draft, retired and sample items are not eligible", () => {
  const r = proposeSet({
    pool: [item(1, { status: "draft" }), item(2, { status: "retired" }), item(3, { is_sample: true }), item(4)],
    stats: {},
    targets: [cell("x", 4)],
    now: NOW,
  });
  assert.deepEqual(r.picks.map((p) => p.id), [4]);
});

test("items already in the set are never proposed again", () => {
  const r = proposeSet({
    pool: [item(1), item(2)],
    stats: {},
    targets: [cell("x", 2)],
    chosen: [1],
    now: NOW,
  });
  assert.deepEqual(r.picks.map((p) => p.id), [2]);
});

test("one item is never used to satisfy two cells", () => {
  const r = proposeSet({
    pool: [item(1), item(2)],
    stats: {},
    targets: [cell("a", 1), cell("b", 2)],
    now: NOW,
  });
  const ids = r.picks.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(r.filled, 2);
});

test("a scarce cell picks before a cell that many items could satisfy", () => {
  // ข้อ 1 เข้าได้ทั้งสองช่อง ข้ออื่นเข้าได้เฉพาะช่องกว้าง
  const pool = [item(1, { nl_group: 1 }), item(2), item(3)];
  const r = proposeSet({
    pool,
    stats: {},
    targets: [
      cell("wide", 2),
      cell("scarce", 1, (i) => i.nl_group === 1),
    ],
    now: NOW,
  });
  assert.equal(r.picks.find((p) => p.cell === "scarce").id, 1);
  assert.deepEqual(r.gaps, []);
});

test("the same seed always produces the same set, a different seed may not", () => {
  const args = { pool: [item(1), item(2), item(3), item(4)], stats: {}, targets: [cell("x", 2)], now: NOW };
  const a = proposeSet({ ...args, seed: "a" });
  const b = proposeSet({ ...args, seed: "a" });
  assert.deepEqual(a.picks, b.picks);
  const seeds = ["a", "b", "c", "d", "e", "f"].map((s) => proposeSet({ ...args, seed: s }).picks.map((p) => p.id).join(","));
  assert.ok(new Set(seeds).size > 1, "เปลี่ยน seed แล้วควรได้ชุดที่ต่างออกไปบ้าง");
});

test("the quota reaches for under-represented authors instead of taking the easiest items", () => {
  // ผู้แต่ง prolific มี 6 ข้อ ผู้แต่ง other มี 2 ข้อ ต้องการ 4 ข้อ
  const pool = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => item(i, { author_id: i <= 6 ? "prolific" : "other" }));
  const r = proposeSet({ pool, stats: {}, targets: [cell("x", 4)], now: NOW });
  assert.equal(r.filled, 4);
  // ผู้แต่งเสียงข้างน้อยต้องได้ที่นั่ง ไม่ถูก prolific กวาดไปทั้งชุด
  assert.ok(r.picks.some((p) => p.id >= 7), "ควรมีข้อของผู้แต่งอีกคนอย่างน้อยหนึ่งข้อ");
  assert.ok(r.picks.filter((p) => p.id <= 6).length < 4, "prolific ต้องไม่ได้ครบทุกที่นั่ง");

  // ถ้าปิดโควตา ผู้แต่งที่มีของเยอะที่สุดสามารถกวาดได้ทั้งชุด
  const noQuota = proposeSet({
    pool, stats: {}, targets: [cell("x", 4)], now: NOW, options: { maxSharePerAuthor: 1 },
  });
  assert.ok(
    noQuota.picks.filter((p) => p.id <= 6).length >= r.picks.filter((p) => p.id <= 6).length,
    "การเปิดโควตาต้องไม่ทำให้ผู้แต่งคนเดียวได้ที่นั่งมากขึ้น",
  );
});

test("the author quota slows a writer down but never blocks a set from filling", () => {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => item(i, { author_id: i <= 6 ? "prolific" : "other" }));
  const r = proposeSet({ pool, stats: {}, targets: [cell("x", 8)], now: NOW });
  assert.equal(r.filled, 8);
  assert.deepEqual(r.gaps, []);
  assert.ok(DEFAULTS.maxSharePerAuthor < 1);
});

test("an empty blueprint is not reported as complete", () => {
  const r = proposeSet({ pool: [item(1)], stats: {}, targets: [], now: NOW });
  assert.equal(r.complete, false);
  assert.equal(r.need, 0);
});

test("quality scoring places good above untested above weak", () => {
  assert.ok(qualityScore(good).score > qualityScore(null).score);
  assert.ok(qualityScore(null).score > qualityScore(weak).score);
  assert.equal(qualityScore(miskeyed).score, 0);
  assert.equal(qualityScore(null).tested, false);
});

test("a small cohort pulls the score toward neutral", () => {
  const small = { ...good, n: 10 };
  assert.ok(qualityScore(small).score < qualityScore(good).score);
  assert.ok(qualityScore(small).score > 0.5);
});

test("exposure penalty is zero once an item has rested long enough", () => {
  assert.equal(exposurePenalty(item(1, { last_used_at: ago(400) }), DEFAULTS, NOW), 0);
  assert.ok(exposurePenalty(item(1, { last_used_at: ago(10) }), DEFAULTS, NOW) > 0.5);
});

test("stats may be supplied as a Map as well as a plain object", () => {
  const r = proposeSet({
    pool: [item(1), item(2)],
    stats: new Map([[1, weak]]),
    targets: [cell("x", 1)],
    now: NOW,
  });
  assert.equal(r.picks[0].id, 2);
});

import fs from "node:fs";
import { minMax, contains } from "./zonestat.js";
import { step, close } from "./statrun.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/zones.json", "utf8"));
const events = spec.events || [];
const half = Math.ceil(events.length / 2);
const first = step(spec);
const closed = close(Object.assign({}, spec, { state: first.state }));
const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
const replay = step(Object.assign({}, spec, { state: closed.state }));
const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
const full = step(Object.assign({}, spec, { events: events, budget: events.length + 2 }));
const fullClosed = close(Object.assign({}, spec, { state: full.state }));
const fingerprint = function (state) {
  return JSON.stringify({
    blocks: state.blocks, stats: state.stats, dirty: state.dirty, sealed: state.sealed,
    applied: state.applied.length
  });
};
const names = Object.keys(closed.state.blocks).sort();

emit("收尾后各块统计 =", JSON.stringify(names.map(function (name) {
  const stat = closed.state.stats[name] || null;
  return [name, stat ? stat[0] : null, stat ? stat[1] : null];
})));
emit("收尾后各块内容 =", JSON.stringify(names.map(function (name) {
  return [name, closed.state.blocks[name]];
})));
emit("封口块 =", JSON.stringify(closed.state.sealed));
emit("首轮重算块数 =", first.restat);
emit("二档重算块数 =", wide.restat);
emit("两个预算档重算不同 =", first.restat !== wide.restat);
emit("收尾前待重算账 =", first.dirty_before);
emit("统计过期的块 =", JSON.stringify(first.dirty));
emit("收尾补齐条数 =", closed.catchup);
emit("收尾后待重算账 =", closed.state.dirty.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新重算 =", replay.restat);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
try {
  step(Object.assign({}, { budget: 1,
    state: { blocks: {}, stats: {}, dirty: [], sealed: [], applied: [] },
    events: [{ id: 1, kind: "append", block: "b1", value: 5 }] }));
  emit("未知块报码", "没有报错");
} catch (error) {
  emit("未知块报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { budget: 1,
    state: { blocks: { b1: [] }, stats: {}, dirty: [], sealed: [], applied: [] },
    events: [{ id: 1, kind: "open", block: "b1" }] }));
  emit("块名重复报码", "没有报错");
} catch (error) {
  emit("块名重复报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { budget: 1,
    state: { blocks: { b1: [] }, stats: {}, dirty: [], sealed: ["b1"], applied: [] },
    events: [{ id: 1, kind: "append", block: "b1", value: 5 }] }));
  emit("封口后追加报码", "没有报错");
} catch (error) {
  emit("封口后追加报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { budget: 1,
    state: { blocks: {}, stats: {}, dirty: [], sealed: [], applied: [] },
    events: [{ id: 1, kind: "peek", block: "b1" }] }));
  emit("事件不合法报码", "没有报错");
} catch (error) {
  emit("事件不合法报码", error && error.code ? error.code : String(error.message));
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后各块统计": [
    [
      "b1",
      3,
      5
    ],
    [
      "b2",
      7,
      7
    ]
  ],
  "收尾后各块内容": [
    [
      "b1",
      [
        5,
        3
      ]
    ],
    [
      "b2",
      [
        7
      ]
    ]
  ],
  "封口块": [
    "b1"
  ],
  "首轮重算块数": 1,
  "二档重算块数": 3,
  "两个预算档重算不同": true,
  "收尾前待重算账": 2,
  "统计过期的块": [
    "b1",
    "b2"
  ],
  "收尾补齐条数": 2,
  "收尾后待重算账": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新重算": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "未知块报码": "E_NO_BLOCK",
  "块名重复报码": "E_DUPLICATE_BLOCK",
  "封口后追加报码": "E_SEALED",
  "事件不合法报码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);

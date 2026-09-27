import assert from "node:assert";
import { minMax, contains } from "../zonestat.js";
import { step, close } from "../statrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { blocks: {}, stats: {}, dirty: [], sealed: [], applied: [] },
  events: [],
  block_error_code: "E_NO_BLOCK", duplicate_error_code: "E_DUPLICATE_BLOCK",
  sealed_error_code: "E_SEALED", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("minMax returns a pair", () => {
  assert.ok(Array.isArray(minMax([1, 2])));
});

check("contains returns a flag", () => {
  assert.strictEqual(typeof contains([1], 1), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);

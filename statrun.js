// statrun.js：按重算预算刷新统计并留账
import { minMax } from "./zonestat.js";

function cloneState(source) {
  const state = source || {};
  const blocks = {};
  for (const name of Object.keys(state.blocks || {})) blocks[name] = state.blocks[name].slice();
  const stats = {};
  for (const name of Object.keys(state.stats || {})) stats[name] = state.stats[name].slice();
  return {
    blocks: blocks,
    stats: stats,
    dirty: (state.dirty || []).slice(),
    sealed: (state.sealed || []).slice(),
    applied: (state.applied || []).slice()
  };
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function errorCodes(spec) {
  return {
    noBlock: spec.block_error_code || "E_NO_BLOCK",
    duplicate: spec.duplicate_error_code || "E_DUPLICATE_BLOCK",
    sealed: spec.sealed_error_code || "E_SEALED",
    badEvent: spec.event_error_code || "E_BAD_EVENT"
  };
}

function validateEvent(event, badEventCode) {
  if (!event || typeof event !== "object") fail(badEventCode);
  if (event.kind !== "open" && event.kind !== "append" && event.kind !== "seal") fail(badEventCode);
  if (typeof event.block !== "string" || event.block.length === 0) fail(badEventCode);
  if (event.kind === "append" && typeof event.value !== "number") fail(badEventCode);
}

function hasBlock(state, name) {
  return Object.prototype.hasOwnProperty.call(state.blocks, name);
}

function markDirty(state, name) {
  if (state.dirty.indexOf(name) === -1) state.dirty.push(name);
}

function recomputeOne(state) {
  const name = state.dirty.shift();
  state.stats[name] = minMax(state.blocks[name]);
}

export function step(spec) {
  const state = cloneState(spec.state);
  const codes = errorCodes(spec);
  const events = spec.events || [];
  let budget = typeof spec.budget === "number" ? spec.budget : 0;
  let restat = 0;
  for (const event of events) {
    const id = event && event.id;
    if (id !== undefined && state.applied.indexOf(id) !== -1) continue;
    validateEvent(event, codes.badEvent);
    if (event.kind === "open") {
      if (hasBlock(state, event.block)) fail(codes.duplicate);
      state.blocks[event.block] = [];
      state.stats[event.block] = minMax([]);
    } else if (event.kind === "append") {
      if (!hasBlock(state, event.block)) fail(codes.noBlock);
      if (state.sealed.indexOf(event.block) !== -1) fail(codes.sealed);
      state.blocks[event.block].push(event.value);
      markDirty(state, event.block);
    } else {
      if (!hasBlock(state, event.block)) fail(codes.noBlock);
      if (state.sealed.indexOf(event.block) === -1) state.sealed.push(event.block);
    }
    if (id !== undefined) state.applied.push(id);
    if (budget > 0 && state.dirty.length > 0) {
      recomputeOne(state);
      restat += 1;
      budget -= 1;
    }
  }
  return {
    state: state,
    restat: restat,
    dirty_before: state.dirty.length,
    dirty: state.dirty.slice(),
    judged: restat,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.dirty.length > 0) {
    recomputeOne(state);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}

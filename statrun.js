// statrun.js：按整批共用的重算预算刷新分块统计，并把超预算的过期块压成账本。
// 跨轮状态：blocks（块内容）、stats（块统计）、dirty（待重算账）、
// sealed（封口集合）、applied（已处理事件标识，保证重放幂等）。
import { minMax } from "./zonestat.js";

const DEFAULT_CODES = {
  block: "E_NO_BLOCK",
  duplicate: "E_DUPLICATE_BLOCK",
  sealed: "E_SEALED",
  event: "E_BAD_EVENT"
};

function codesOf(spec) {
  return {
    block: spec.block_error_code || DEFAULT_CODES.block,
    duplicate: spec.duplicate_error_code || DEFAULT_CODES.duplicate,
    sealed: spec.sealed_error_code || DEFAULT_CODES.sealed,
    event: spec.event_error_code || DEFAULT_CODES.event
  };
}

function failure(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

// 深拷贝跨轮状态，step 绝不改输入，保证同一份 state 可被反复重放。
function cloneState(state) {
  const source = state || {};
  const blocks = {};
  const stats = {};
  const sourceBlocks = source.blocks || {};
  const sourceStats = source.stats || {};
  Object.keys(sourceBlocks).forEach(function (name) {
    blocks[name] = sourceBlocks[name].slice();
  });
  Object.keys(sourceStats).forEach(function (name) {
    const pair = sourceStats[name];
    stats[name] = Array.isArray(pair) ? [pair[0], pair[1]] : pair;
  });
  return {
    blocks: blocks,
    stats: stats,
    dirty: (source.dirty || []).slice(),
    sealed: (source.sealed || []).slice(),
    applied: (source.applied || []).slice()
  };
}

function isName(block) {
  return typeof block === "string" && block.length > 0;
}

// 事件合法性：kind / block 合法，append 必须带 value。
function validateEvent(event, codes) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw failure(codes.event);
  }
  if (!isName(event.block)) {
    throw failure(codes.event);
  }
  if (event.kind === "append") {
    if (event.value === undefined || event.value === null) {
      throw failure(codes.event);
    }
    return;
  }
  if (event.kind !== "open" && event.kind !== "seal") {
    throw failure(codes.event);
  }
}

function markDirty(state, block) {
  if (state.dirty.indexOf(block) === -1) {
    state.dirty.push(block);
  }
}

function recomputeOne(state, block) {
  state.stats[block] = minMax(state.blocks[block]);
  const at = state.dirty.indexOf(block);
  if (at !== -1) {
    state.dirty.splice(at, 1);
  }
}

export function step(spec) {
  const source = spec && spec.state ? spec.state : {};
  const events = (spec && spec.events) || [];
  const codes = codesOf(spec || {});
  // 整批共用的重算预算；用尽后过期块压在账上带出下一轮。
  let budget = Number.isFinite(spec && spec.budget) ? Math.max(0, Math.trunc(spec.budget)) : 0;

  const state = cloneState(source);
  let restat = 0;
  let judged = 0;

  events.forEach(function (event) {
    validateEvent(event, codes);

    // 重放幂等：已处理过的事件不再执行、不再计入工作与重算。
    if (event.id !== undefined && event.id !== null && state.applied.indexOf(event.id) !== -1) {
      return;
    }

    const block = event.block;

    if (event.kind === "open") {
      if (Object.prototype.hasOwnProperty.call(state.blocks, block)) {
        throw failure(codes.duplicate);
      }
      state.blocks[block] = [];
    } else if (event.kind === "append") {
      if (!Object.prototype.hasOwnProperty.call(state.blocks, block)) {
        throw failure(codes.block);
      }
      if (state.sealed.indexOf(block) !== -1) {
        throw failure(codes.sealed);
      }
      state.blocks[block].push(event.value);
      markDirty(state, block);
    } else if (event.kind === "seal") {
      if (!Object.prototype.hasOwnProperty.call(state.blocks, block)) {
        throw failure(codes.block);
      }
      if (state.sealed.indexOf(block) === -1) {
        state.sealed.push(block);
      }
    }

    if (event.id !== undefined && event.id !== null) {
      state.applied.push(event.id);
    }
    judged += 1;

    // 每条事件后按预算从过期块里挑一个重算（按入账先后）。
    if (budget > 0 && state.dirty.length > 0) {
      recomputeOne(state, state.dirty[0]);
      budget -= 1;
      restat += 1;
    }
  });

  return {
    state: state,
    restat: restat,
    dirty_before: state.dirty.length,
    dirty: state.dirty.slice(),
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = cloneState(spec && spec.state ? spec.state : {});
  let catchup = 0;

  // 收尾不限预算：把账上过期统计按入账顺序全部重算完。
  while (state.dirty.length > 0) {
    recomputeOne(state, state.dirty[0]);
    catchup += 1;
  }

  return { state: state, catchup: catchup };
}

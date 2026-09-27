// app.js：渲染结果
import { minMax, contains } from "./zonestat.js";
import { step, close } from "./statrun.js";

export function render(spec) {
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
  const stats = names.map(function (name) {
    const stat = closed.state.stats[name] || null;
    return [name, closed.state.blocks[name].slice(), stat ? stat[0] : null, stat ? stat[1] : null];
  });
  return { stats: stats, sealed: closed.state.sealed.slice(),
           restat_first: first.restat, restat_wide: wide.restat,
           pair_differs: first.restat !== wide.restat,
           dirty_before: first.dirty_before, dirty: first.dirty,
           catchup: closed.catchup, dirty_after: closed.state.dirty.length,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.restat, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length, tail: contains([], 0) ? 1 : 0 };
}

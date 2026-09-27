// statrun.js：按重算预算刷新统计并留账（基线：一律给空表）
import { minMax, contains } from "./zonestat.js";

export function step(spec) {
  return { state: spec.state, restat: 0, dirty_before: 0, dirty: [], judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}

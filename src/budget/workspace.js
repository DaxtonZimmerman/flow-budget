// All React screens use the existing owner-protected save and offline queue.
export function readWorkspace() {
  return getFlowSnapshot();
}
export function owner() {
  return flowStorage.getItem("flow_user_id") || "";
}
export function fingerprint() {
  return JSON.stringify(readWorkspace());
}
export function assertCurrent(base) {
  if (
    owner() !== base.owner ||
    flowToday() !== base.day ||
    fingerprint() !== base.stamp
  )
    throw new Error(
      "New activity arrived. Refresh this preview before saving.",
    );
  if (
    !flowDemoMode &&
    (!window.FlowAuth?.authorized || window.FlowAuth.user?.id !== base.owner)
  )
    throw new Error("Sign in again before saving.");
}
export function saveWorkspace(next, base) {
  assertCurrent(base);
  replaceFlowSnapshot(next);
  flowDataChanged();
  document.dispatchEvent(new Event("flow-transaction-updated"));
  document.dispatchEvent(new Event("flow-planning-updated"));
  document.dispatchEvent(new Event("flow-budgets-updated"));
}
export function capture() {
  const snapshot = readWorkspace();
  return {
    snapshot,
    owner: owner(),
    stamp: JSON.stringify(snapshot),
    day: flowToday(),
  };
}
export function parseMoney(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const n = Math.round(Number(value) * 100);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

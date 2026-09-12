let notifyFn = null;
let pendingResolve = null;

export function setEprTargetsNotifier(fn) {
  notifyFn = typeof fn === 'function' ? fn : null;
}

export function notifyEprTargetsPrompt(payload = {}) {
  if (notifyFn) notifyFn(payload);
}

export function waitForEprTargetsConfirmation(timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve) => {
    pendingResolve = resolve;
    setTimeout(() => {
      if (pendingResolve === resolve) {
        pendingResolve = null;
        resolve({ confirmed: false, timeout: true });
      }
    }, timeoutMs);
  });
}

export function resolveEprTargetsConfirmation(payload = {}) {
  if (!pendingResolve) {
    return { success: false, error: 'No EPR targets confirmation prompt is waiting' };
  }
  const decision = {
    confirmed: Boolean(payload.confirmed),
  };
  pendingResolve(decision);
  pendingResolve = null;
  return { success: true };
}

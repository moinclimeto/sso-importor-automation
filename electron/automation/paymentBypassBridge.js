let notifyFn = null;
let pendingResolve = null;

export function setPaymentBypassNotifier(fn) {
  notifyFn = typeof fn === 'function' ? fn : null;
}

export function notifyPaymentBypassPrompt() {
  if (notifyFn) notifyFn();
}

export function waitForPaymentBypassAnswer(timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    pendingResolve = resolve;
    setTimeout(() => {
      if (pendingResolve === resolve) {
        pendingResolve = null;
        resolve({ bypass: false });
      }
    }, timeoutMs);
  });
}

export function resolvePaymentBypass(payload = {}) {
  if (!pendingResolve) {
    return { success: false, error: 'No payment-bypass prompt is waiting' };
  }
  const decision = {
    bypass: Boolean(payload.bypass),
    transactionId: String(payload.transactionId || '').trim(),
  };
  pendingResolve(decision);
  pendingResolve = null;
  return { success: true };
}

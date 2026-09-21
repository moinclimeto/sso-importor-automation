let notifyFn = null;

export function setPaymentReviewNotifier(fn) {
  notifyFn = typeof fn === 'function' ? fn : null;
}

export function notifyPaymentReview(payload = {}) {
  if (notifyFn) notifyFn(payload);
}

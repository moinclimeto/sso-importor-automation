const HIDE_PATTERNS = [
  /^\[DEBUG\]/i,
  /^Clicking/i,
  /^Entering/i,
  /^Filling /i,
  /^Selecting /i,
  /^Uploading /i,
  /^Waiting for/i,
  /^Opening CPCB/i,
  /^Navigating/i,
  /^Starting registration/i,
  /^Submitting User/i,
  /^Requesting Email/i,
  /^Portal navigation/i,
  /^Retrying/i,
  /^OTP submitted/i,
  /^Get OTP clicked/i,
  /^Verify click blocked/i,
  /^Continue clicked/i,
  /^Supporting Documents tab/i,
  /^Compressing /i,
  /^File not found/i,
  /attempt \d+\/\d+/i,
  /^Refreshing captcha/i,
  /^Clearing/i,
  /portal loader/i,
  /read-only/i,
  /skipping/i,
  /^Warning:/i,
  /^Fields still empty/i,
  /^Portal is asking/i,
  /^Resending Mobile OTP/i,
  /^Clicking Resend/i,
  /^Verifying /i,
  /^Capturing registration/i,
  /^Saved to DB/i,
  /^General Information attempt/i,
  /^Supporting Documents warning/i,
];

const MESSAGE_MAP = [
  [/GST verified/i, 'GST verified'],
  [/Email OTP sent|Waiting for Email OTP/i, 'Email OTP sent'],
  [/Email verified|Email OTP verified/i, 'Email verified'],
  [/Mobile OTP resent/i, 'Mobile OTP resent'],
  [/Mobile OTP sent|check your phone/i, 'Mobile OTP sent'],
  [/Mobile OTP verified/i, 'Mobile OTP verified'],
  [/Enter captcha/i, 'Enter captcha to finish'],
  [/CEPR ID captured/i, (text) => {
    const match = text.match(/CEPR ID:\s*(\S+)/i);
    return match ? `Registration complete — CEPR ID: ${match[1]}` : 'Registration complete';
  }],
  [/Registration complete/i, 'Registration complete'],
  [/PAN uploaded|uploaded successfully/i, 'PAN document uploaded'],
  [/General Information filled/i, 'General information filled'],
];

function deriveStepHint(text) {
  const lower = String(text).toLowerCase();
  if (/gst/.test(lower)) return 'Verifying GST…';
  if (/email/.test(lower)) return 'Processing email verification…';
  if (/mobile/.test(lower)) return 'Processing mobile verification…';
  if (/captcha/.test(lower)) return 'Processing captcha…';
  if (/general|supporting|authorised person|authorized person|already exists/.test(lower)) {
    return String(text).split('\n')[0].trim().slice(0, 120);
  }
  return 'Working on CPCB portal…';
}

function isPortalUserMessage(text) {
  const clean = String(text || '').trim();
  if (!clean || /locator\.(click|fill)|timeout.*exceeded|call log:|retrying click action/i.test(clean)) {
    return false;
  }
  return /authorised person|authorized person|already exists|gst status|something went wrong|please try|invalid |mandatory|not uploaded|not selected|registration cannot|conflict|duplicate|otp has been|otp sent|verified on cpcb|cepr|company registration failed|lost credentials/i.test(clean);
}

function cleanErrorMessage(text) {
  let clean = String(text || '')
    .replace(/^(Email|Mobile) OTP error:\s*/i, '')
    .replace(/^[×x]\s*/i, '')
    .trim();

  if (isPortalUserMessage(clean)) {
    return clean.split('\n')[0].trim().slice(0, 200);
  }

  if (/locator\.(click|fill)|timeout.*exceeded|call log:|element is not enabled|retrying click action/i.test(clean)) {
    if (/resend/i.test(clean)) return 'Could not resend OTP. Please try again.';
    if (/verify otp|incorrect otp|failed to verify/i.test(clean)) return 'Incorrect OTP — please try again.';
    // Keep generic only when no portal context is available on the client.
    return 'CPCB portal did not respond. Please try again.';
  }

  clean = clean.split('\n')[0].trim();
  if (clean.length > 100) clean = `${clean.slice(0, 97)}...`;
  return clean;
}

/** Decide whether an automation log line belongs in the modal steps list. */
export function classifyAutomationLog(message, type = 'info') {
  const text = String(message || '').trim();
  if (!text) return { addToList: false };

  if (isPortalUserMessage(text)) {
    const portalType = /already exists|failed|invalid|error|something went wrong|mandatory|not uploaded|cannot proceed|conflict/i.test(text)
      ? 'error'
      : type === 'success'
        ? 'success'
        : 'info';
    const portalMessage = text.split('\n')[0].trim().slice(0, 200);
    return {
      addToList: true,
      message: portalMessage,
      type: portalType,
      stepHint: portalMessage,
    };
  }

  const isError = type === 'error'
    || /^error:/i.test(text)
    || /failed to verify otp|incorrect otp|invalid captcha/i.test(text)
    || /locator\.(click|fill)|timeout.*exceeded|element is not enabled/i.test(text);

  if (isError) {
    const clean = cleanErrorMessage(text);
    return {
      addToList: true,
      message: clean,
      type: 'error',
      stepHint: clean,
    };
  }

  if (HIDE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { addToList: false, stepHint: deriveStepHint(text) };
  }

  for (const [pattern, out] of MESSAGE_MAP) {
    if (pattern.test(text)) {
      const mapped = typeof out === 'function' ? out(text) : out;
      return {
        addToList: true,
        message: mapped,
        type: 'success',
        stepHint: mapped,
      };
    }
  }

  if (/verified|complete|success|sent|accepted/i.test(text) && text.length < 72) {
    return {
      addToList: true,
      message: text,
      type: 'success',
      stepHint: text,
    };
  }

  return { addToList: false, stepHint: deriveStepHint(text) };
}

export function sanitizeAutomationUserError(message) {
  return cleanErrorMessage(message);
}

export const MAX_AUTOMATION_LOG_ITEMS = 8;

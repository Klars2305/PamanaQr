// Shared Pamana foundation: constants, error helpers, DOM helpers, URL helpers.
// This file must load before every other Pamana script.
// It contains no Supabase calls and no page-specific behaviour.

/* ---------------------------------------------------------------------------
 * Constants
 * These values are contracts shared with the database, the RLS policies, the
 * HTML option lists, and the public URLs. Do not change the string values.
 * ------------------------------------------------------------------------ */

const PAMANA_ROLES = {
  contributor: 'contributor',
  admin: 'admin'
};

const SITE_STATUSES = {
  active: 'active',
  archived: 'archived'
};

const STORY_STATUSES = {
  submitted: 'submitted',
  published: 'published',
  rejected: 'rejected'
};

const SITE_STATUS_VALUES = Object.values(SITE_STATUSES);
const STORY_STATUS_VALUES = Object.values(STORY_STATUSES);

const STORY_CLASSIFICATIONS = [
  'Documented Historical Information',
  'Oral History',
  'Personal Recollection',
  'Community Legend'
];

const STATUS_BADGES = {
  active: { label: 'Active', className: 'badge-status-active' },
  archived: { label: 'Archived', className: 'badge-status-archived' },
  submitted: { label: 'Submitted', className: 'badge-status-submitted' },
  published: { label: 'Published', className: 'badge-status-published' },
  rejected: { label: 'Rejected', className: 'badge-status-rejected' }
};

const APP_MESSAGES = {
  registrationFailed: 'Registration could not be completed. Please try again.',
  existingEmail: 'This email is already registered. Please log in instead.',
  invalidEmail: 'Enter a valid email address.',
  weakPassword: 'Please check your password and try again.',
  loginFailed: 'Incorrect email or password. Please check your details and try again.',
  loginRequired: 'You need to log in before continuing.',
  contributorLoginRequired: 'You need to log in before submitting a story.',
  unauthorized: 'You do not have permission to access this page.',
  sessionExpired: 'Your session has expired. Please log in again.',
  databaseFailed: 'Something went wrong while loading information. Please try again.',
  saveFailed: 'Something went wrong while saving. Please try again.',
  storageFailed: 'Something went wrong while uploading the image. Please try again.',
  invalidImage: 'Please upload a valid JPG, JPEG, PNG, or WEBP image under 5 MB.',
  duplicateSlug: 'A heritage site with this name already exists. Please use a more specific name.',
  heritageNotFound: 'This heritage site was not found or is not currently active.',
  storyNotFound: 'This story is unavailable or has not been published.',
  noSearchResults: 'No public heritage results matched your search.',
  networkFailed: "We couldn't connect to the server. Check your internet connection and try again.",
  unauthorizedSubmission: 'Only logged-in contributors can submit stories.',
  unauthorizedAdminAction: 'Only administrators can perform this action.',
  notConfigured: 'The Supabase connection is not configured yet.',
  profileUnavailable: 'Your account was found, but your profile is not ready yet. Please contact an administrator.',
  qrUnavailable: 'QR code tools are not ready yet. Please refresh the page and try again.',
  popupBlocked: 'Please allow popups to print the QR code.',
  qrNotReady: 'QR image is not ready yet.',
  passwordRequirements: 'Password must contain 8\u201364 characters, including uppercase, lowercase, and a number.',
  rateLimited: 'Too many attempts. Please wait a few minutes before trying again.',
  emailNotConfirmed: 'Please confirm your email address before signing in. Check your inbox and spam folder.',
  duplicateRecord: 'This information already exists. Check the existing record before trying again.',
  invalidRecovery: 'This reset link is invalid or has expired. Request a new link to continue.',
  recoverySent: 'If an account exists for this email, a password reset link has been sent.',
  passwordUpdated: 'Your password has been updated successfully.',
  confirmUnavailable: 'The confirmation dialog could not load. Refresh the page and try again. No action was taken.'
};

/* ---------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------ */

function logAppError(context, error) {
  // Never log credentials, tokens, full request URLs, or raw provider payloads.
  if (error) {
    const code = String(error.code || error.status || 'request-failed').slice(0, 60);
    console.error(context, /^[a-zA-Z0-9_-]+$/.test(code) ? code : 'request-failed');
  }
}

function createAppError(message) {
  const error = new Error(message || APP_MESSAGES.saveFailed);
  error.isPamanaError = true;
  return error;
}

function createErrorResult(message) {
  return { data: null, error: createAppError(message) };
}

function getAppErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage || APP_MESSAGES.saveFailed;
  // Only errors explicitly created by our own code can provide display text.
  if (error.isPamanaError) return error.message;
  const message = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  const status = Number(error.status);

  if (status === 429 || /rate_limit|too_many_requests/.test(code)) return APP_MESSAGES.rateLimited;
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return APP_MESSAGES.loginFailed;
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return APP_MESSAGES.emailNotConfirmed;
  if (/failed to fetch|network|offline|load failed/.test(message)) return APP_MESSAGES.networkFailed;
  if (code === '23505' || /duplicate|unique constraint/.test(message)) return APP_MESSAGES.duplicateRecord;
  if (code === 'otp_expired' || /expired.*link|link.*expired/.test(message)) return APP_MESSAGES.invalidRecovery;
  if (code === 'same_password') return 'Choose a different password from your current password.';
  if (code === 'reauthentication_needed') return 'For your security, request a new reset link and try again.';
  if (status === 403 || /permission|row-level security|rls/.test(message)) return APP_MESSAGES.unauthorized;
  if (status === 401 || /jwt|session.*expired|refresh.token/.test(message)) return APP_MESSAGES.sessionExpired;
  if (/user_already_exists|email_exists/.test(code) || /already registered/.test(message)) return APP_MESSAGES.existingEmail;
  if (code === 'email_address_invalid' || /invalid email/.test(message)) return APP_MESSAGES.invalidEmail;
  if (code === 'weak_password') return APP_MESSAGES.passwordRequirements;
  if (/image|upload|storage/.test(message)) return APP_MESSAGES.storageFailed;
  return fallbackMessage || APP_MESSAGES.saveFailed;
}

/* ---------------------------------------------------------------------------
 * DOM
 * ------------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showAppMessage(elementOrId, message, type) {
  const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (!element) return;
  const tone = ['success', 'info', 'warning', 'danger'].includes(type) ? type : 'info';
  element.classList.remove('d-none', 'alert-success', 'alert-info', 'alert-warning', 'alert-danger');
  element.classList.add('alert', `alert-${tone}`);
  element.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  element.setAttribute('aria-live', tone === 'danger' ? 'assertive' : 'polite');
  element.setAttribute('aria-atomic', 'true');
  element.replaceChildren();
  const loading = tone === 'info' && /^(loading|checking|signing|logging|creating|sending|uploading|submitting|saving|publishing|rejecting|generating|regenerating|updating|removing|searching)/i.test(message);
  element.dataset.loading = String(loading);
  if (loading) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner-border spinner-border-sm me-2';
    spinner.setAttribute('aria-hidden', 'true');
    element.appendChild(spinner);
  }
  element.appendChild(document.createTextNode(message));
}

// Writes display text with a fallback for empty values.
// Not for numeric counters: a zero would fall through to the fallback.
function setText(elementId, value, fallback) {
  const element = document.getElementById(elementId);

  if (element) {
    element.textContent = value || fallback || '';
  }
}

// Writes a value verbatim, so a zero count still renders as "0".
function setCount(elementId, value) {
  const element = document.getElementById(elementId);

  if (element) {
    element.textContent = value;
  }
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleDateString();
}

/* ---------------------------------------------------------------------------
 * Safe markup
 *
 * Build every fragment with the html`` tag. Interpolated values are escaped by
 * default, so a heritage name, story title, caption or reference cannot close
 * an attribute or open a tag. Markup that is genuinely ours passes through
 * trustedHtml, which is the only way to opt out, and the only thing to review.
 * ------------------------------------------------------------------------ */

function trustedHtml(markup) {
  return { pamanaTrustedHtml: String(markup) };
}

function isTrustedHtml(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.pamanaTrustedHtml === 'string';
}

// Escapes for text and for quoted attribute values. Unlike escapeHtml this
// keeps a legitimate 0, because an interpolated id must not vanish.
function escapeHtmlValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return escapeHtml(String(value));
}

function renderHtmlValue(value) {
  if (isTrustedHtml(value)) {
    return value.pamanaTrustedHtml;
  }

  if (Array.isArray(value)) {
    return value.map(renderHtmlValue).join('');
  }

  return escapeHtmlValue(value);
}

function html(strings) {
  const values = Array.prototype.slice.call(arguments, 1);

  return trustedHtml(strings.reduce(function (markup, piece, index) {
    return markup + renderHtmlValue(values[index - 1]) + piece;
  }));
}

// The one place markup reaches the DOM. Anything not marked trusted is escaped.
function setSafeHtml(element, value) {
  if (element) {
    element.innerHTML = renderHtmlValue(value);
  }
}

// Only schemes an image can legitimately use here. A stored path carrying a
// javascript: or data:text/html payload is dropped rather than assigned.
function safeImageUrl(value) {
  const url = String(value || '').trim();
  return /^(https?:\/\/|blob:|data:image\/)/i.test(url) ? url : '';
}

function createStatusBadge(status) {
  const badge = STATUS_BADGES[status];
  const className = badge ? badge.className : 'badge-status-archived';

  return html`<span class="badge ${trustedHtml(className)}">${badge ? badge.label : status}</span>`;
}

// Returns '' when there is nothing to show, so callers can fall back with ||.
function createClassificationBadge(classification) {
  if (!classification) {
    return '';
  }

  return html`<span class="badge badge-classification">${classification}</span>`;
}

/* ---------------------------------------------------------------------------
 * One action at a time
 *
 * Claim the button before the first await, not after. A second click that
 * arrives while the first is still waiting on Supabase finds the button
 * already claimed and is dropped, so one click means one write.
 * ------------------------------------------------------------------------ */

function claimButtonAction(button) {
  if (!button || button.disabled) {
    return false;
  }

  button.disabled = true;
  return true;
}

function releaseButtonAction(button) {
  if (button) {
    button.disabled = false;
  }
}

function claimButtonActions(buttons) {
  if (buttons.some(function (button) {
    return !button || button.disabled;
  })) {
    return false;
  }

  buttons.forEach(function (button) {
    button.disabled = true;
  });

  return true;
}

function releaseButtonActions(buttons) {
  buttons.forEach(releaseButtonAction);
}

/* ---------------------------------------------------------------------------
 * URLs
 * ------------------------------------------------------------------------ */

function getAppBasePath() {
  const pathParts = window.location.pathname.split('/');
  pathParts.pop();

  if (pathParts[pathParts.length - 1] === 'admin' || pathParts[pathParts.length - 1] === 'contributor') {
    pathParts.pop();
  }

  return `${window.location.origin}${pathParts.join('/')}/`;
}

function toAppUrl(path) {
  return new URL(path, getAppBasePath()).href;
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

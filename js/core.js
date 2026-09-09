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
  invalidEmail: 'Please enter a valid email address.',
  weakPassword: 'Please check your password and try again.',
  loginFailed: 'Invalid email or password.',
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
  networkFailed: 'Network connection problem. Please check your internet connection and try again.',
  unauthorizedSubmission: 'Only logged-in contributors can submit stories.',
  unauthorizedAdminAction: 'Only administrators can perform this action.',
  notConfigured: 'The Supabase connection is not configured yet.',
  profileUnavailable: 'Your account was found, but your profile is not ready yet. Please contact an administrator.',
  qrUnavailable: 'QR code tools are not ready yet. Please refresh the page and try again.',
  popupBlocked: 'Please allow popups to print the QR code.',
  qrNotReady: 'QR image is not ready yet.'
};

/* ---------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------ */

function logAppError(context, error) {
  if (error) {
    console.error(context, error);
  }
}

function createAppError(message) {
  return new Error(message || APP_MESSAGES.saveFailed);
}

function createErrorResult(message) {
  return {
    data: null,
    error: createAppError(message)
  };
}

function getAppErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage || APP_MESSAGES.saveFailed;
  }

  const message = String(error.message || error).toLowerCase();
  const status = error.status || error.code;

  if (
    message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('fetch')
    || message.includes('offline')
  ) {
    return APP_MESSAGES.networkFailed;
  }

  if (message.includes('already') || message.includes('registered') || message.includes('user already exists')) {
    return APP_MESSAGES.existingEmail;
  }

  if (message.includes('invalid email')) {
    return APP_MESSAGES.invalidEmail;
  }

  if (message.includes('password')) {
    return APP_MESSAGES.weakPassword;
  }

  if (message.includes('image') || message.includes('upload')) {
    return message.includes('valid jpg')
      ? APP_MESSAGES.invalidImage
      : APP_MESSAGES.storageFailed;
  }

  if (status === 401 || message.includes('jwt') || message.includes('session')) {
    return APP_MESSAGES.sessionExpired;
  }

  if (status === 403 || message.includes('permission') || message.includes('row-level security') || message.includes('rls')) {
    return APP_MESSAGES.unauthorized;
  }

  if (status === '23505' || message.includes('duplicate') || message.includes('unique')) {
    return APP_MESSAGES.duplicateSlug;
  }

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
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = `alert alert-${type}`;
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

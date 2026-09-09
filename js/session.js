// Session, roles and protected-page rules.
//
// Row Level Security is the real security layer. Nothing here grants access to
// data; the checks below only decide what the browser renders and where it
// sends the visitor. A user who bypasses these still gets nothing from
// Supabase that the policies in database/schema.sql do not allow.
//
// The session and profile are fetched once per page load and reused by every
// guard. The cache is cleared whenever Supabase reports the session changed.

const ROLE_ROUTES = {
  contributor: 'contributor/dashboard.html',
  admin: 'admin/dashboard.html'
};

const PROTECTED_PAGE_ROLES = [PAMANA_ROLES.contributor, PAMANA_ROLES.admin];

let cachedUserRequest = null;
let cachedProfileRequest = null;
let isWatchingAuthState = false;

// A page can ask for protection twice: once from data-require-role on <body>,
// and once from its own requireAdmin/requireContributor call. Both used to
// assign window.location.href, so two navigations raced and the second could
// overwrite the first destination. The first navigation now wins.
let navigationStarted = false;

function goToAppPage(path) {
  if (navigationStarted) {
    return false;
  }

  navigationStarted = true;
  window.location.href = toAppUrl(path);
  return true;
}

function clearSessionCache() {
  cachedUserRequest = null;
  cachedProfileRequest = null;
}

function watchAuthStateChanges() {
  if (isWatchingAuthState) {
    return;
  }

  const supabaseClient = getSupabaseClient();

  if (!supabaseClient) {
    return;
  }

  isWatchingAuthState = true;

  // Sign-in, sign-out and an expired session all invalidate the cache, so the
  // next guard re-checks with Supabase instead of trusting a stale answer.
  supabaseClient.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY' || event === 'TOKEN_REFRESHED') {
      clearSessionCache();
      // Refresh navigation after the SDK callback returns, including other-tab sign-outs.
      setTimeout(function () {
        if (typeof updateRoleNavigation === 'function') updateRoleNavigation();
      }, 0);
    }
  });
}

async function requestCurrentUser() {
  const supabaseClient = getSupabaseClient();

  if (!supabaseClient) {
    return null;
  }

  let data;
  let error;

  try {
    const result = await supabaseClient.auth.getUser();
    data = result.data;
    error = result.error;
  } catch (requestError) {
    logAppError('Could not get authenticated user.', requestError);
    return null;
  }

  if (error) {
    if (error.name !== 'AuthSessionMissingError') logAppError('Could not get authenticated user.', error);
    return null;
  }

  return data.user;
}

function getCurrentUser() {
  watchAuthStateChanges();

  if (!cachedUserRequest) {
    cachedUserRequest = requestCurrentUser();
  }

  return cachedUserRequest;
}

async function getUserProfile(userId) {
  if (!getSupabaseClient() || !userId) {
    return null;
  }

  const { data, error } = await ProfileQueries.getById(userId);

  if (error) {
    logAppError('Could not load user profile.', error);
    return null;
  }

  return data;
}

async function requestCurrentUserProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return getUserProfile(user.id);
}

function getCurrentUserProfile() {
  if (!cachedProfileRequest) {
    cachedProfileRequest = requestCurrentUserProfile();
  }

  return cachedProfileRequest;
}

async function loginUser(email, password) {
  const result = await runSupabaseQuery('Login request failed.', APP_MESSAGES.loginFailed, function (supabaseClient) {
    return supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });
  });

  if (!result.error) {
    clearSessionCache();
  }

  return result;
}

let logoutInProgress = false;
async function logoutUser(event) {
  if (logoutInProgress) return;
  logoutInProgress = true;
  const button = event && event.currentTarget && event.currentTarget.tagName === 'BUTTON' ? event.currentTarget : null;
  let leaving = false;
  try {
    await showConfirmationModal({
      title: 'Sign out?',
      message: 'Are you sure you want to sign out? Unsaved form entries will not be saved.',
      confirmText: 'Sign out',
      cancelText: 'Stay Signed In',
      variant: 'warning',
      trigger: button || document.activeElement,
      onConfirm: async function () {
        const client = getSupabaseClient();
        if (!client) { showGlobalFeedback(APP_MESSAGES.notConfigured, 'danger'); return; }
        setSubmitLoading(button, true, 'Signing out...', 'Logout');
        const { error } = await client.auth.signOut();
        if (error) {
          logAppError('Logout failed.', error);
          showGlobalFeedback(getAppErrorMessage(error, 'We could not sign you out. Please try again.'), 'danger');
          return;
        }
        clearSessionCache();
        rememberAppFeedback('You have been signed out.', 'success');
        leaving = true;
        goToAppPage('login.html');
      }
    });
  } catch (error) {
    logAppError('Logout request failed.', error);
    showGlobalFeedback(getAppErrorMessage(error, 'We could not sign you out. Please try again.'), 'danger');
  } finally {
    logoutInProgress = false;
    setSubmitLoading(button, false, '', 'Logout');
    if (button && leaving) button.disabled = true;
  }
}

async function registerContributor(displayName, email, password) {
  const invalid = validateRequired(displayName, 'your display name') || validateEmail(email) || validatePassword(password);
  if (invalid) return createErrorResult(invalid);
  displayName = displayName.trim();
  email = email.trim();
  return runSupabaseQuery('Registration request failed.', APP_MESSAGES.registrationFailed, function (supabaseClient) {
    return supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          display_name: displayName
        }
      }
    });
  });
}

function hasRole(profile, role) {
  return Boolean(profile && profile.role === role);
}

function redirectByRole(profile) {
  if (!profile || !ROLE_ROUTES[profile.role]) {
    goToAppPage('login.html');
    return;
  }

  goToAppPage(ROLE_ROUTES[profile.role]);
}

// The role a page demands, taken from data-require-role on <body>.
function getRequiredPageRole() {
  const requiredRole = document.body.dataset.requireRole;
  return PROTECTED_PAGE_ROLES.includes(requiredRole) ? requiredRole : '';
}

async function requireAuthentication() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    const message = getRequiredPageRole() === PAMANA_ROLES.contributor
      ? APP_MESSAGES.contributorLoginRequired
      : APP_MESSAGES.loginRequired;

    try {
      sessionStorage.setItem('pamanaAuthMessage', message);
    } catch (_) {
      // Private-mode storage failures must not block the redirect.
    }

    goToAppPage('login.html');
    return null;
  }

  return profile;
}

async function requireRole(role) {
  const profile = await requireAuthentication();

  if (!profile) {
    return null;
  }

  if (!hasRole(profile, role)) {
    try {
      sessionStorage.setItem('pamanaAuthMessage', APP_MESSAGES.unauthorized);
    } catch (_) {
      // Private-mode storage failures must not block the redirect.
    }

    redirectByRole(profile);
    return null;
  }

  return profile;
}

async function requireContributor() {
  return requireRole(PAMANA_ROLES.contributor);
}

async function requireAdmin() {
  return requireRole(PAMANA_ROLES.admin);
}

// Enforces the page's own data-require-role rule. Called once per page load.
async function applyPageProtection() {
  const requiredRole = getRequiredPageRole();

  if (!requiredRole) {
    return null;
  }

  return requireRole(requiredRole);
}

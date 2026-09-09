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
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      clearSessionCache();
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
    logAppError('Could not get authenticated user.', error);
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

async function logoutUser() {
  const supabaseClient = getSupabaseClient();

  if (!supabaseClient) {
    return;
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    logAppError('Logout failed.', error);
  }

  clearSessionCache();
  window.location.href = toAppUrl('login.html');
}

async function registerContributor(displayName, email, password) {
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

async function redirectByRole(profile) {
  if (!profile || !ROLE_ROUTES[profile.role]) {
    window.location.href = toAppUrl('login.html');
    return;
  }

  window.location.href = toAppUrl(ROLE_ROUTES[profile.role]);
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

    sessionStorage.setItem('pamanaAuthMessage', message);
    window.location.href = toAppUrl('login.html');
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
    sessionStorage.setItem('pamanaAuthMessage', APP_MESSAGES.unauthorized);
    await redirectByRole(profile);
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

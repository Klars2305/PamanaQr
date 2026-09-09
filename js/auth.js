// Auth-facing DOM: role navigation, the session status line, and the login and
// registration form controllers. Session state, guards and protected-page
// rules live in js/session.js.

const MIN_PASSWORD_LENGTH = PASSWORD_RULES.min;
const ROLE_NAV_ITEMS = {
  visitor: [
    { label: 'Home', path: 'index.html', icon: 'home' },
    { label: 'Browse', path: 'browse.html', icon: 'explore' },
    { label: 'Register', path: 'register.html', icon: 'contributor' },
    { label: 'Login', path: 'login.html', icon: 'profile', activePaths: ['admin/login.html', 'forgot-password.html', 'reset-password.html'] }
  ],
  contributor: [
    { label: 'Home', path: 'index.html', icon: 'home' },
    { label: 'Browse', path: 'browse.html', icon: 'explore' },
    { label: 'Contribute', path: 'contribute.html', icon: 'contribute' },
    { label: 'My Submissions', path: 'contributor/submissions.html', icon: 'stories', mobileLabel: 'Submissions' },
    { label: 'Dashboard', path: 'contributor/dashboard.html', icon: 'profile' },
    { label: 'Logout', action: 'logout' }
  ],
  admin: [
    { label: 'Dashboard', path: 'admin/dashboard.html', icon: 'home' },
    { label: 'Heritage Sites', path: 'admin/heritage-sites.html', icon: 'heritage-site', activePaths: ['admin/heritage-form.html'] },
    { label: 'Submissions', path: 'admin/submissions.html', icon: 'stories', activePaths: ['admin/review-story.html'] },
    { label: 'Public Site', path: 'index.html', icon: 'explore' },
    { label: 'Logout', action: 'logout' }
  ]
};

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isCurrentPath(path) {
  return window.location.pathname === new URL(toAppUrl(path)).pathname;
}

function ensureMobileNavbar(navbar) {
  const container = navbar.querySelector('.container');
  const navList = navbar.querySelector('.navbar-nav');

  if (!container || !navList) {
    return;
  }

  let collapse = navbar.querySelector('.navbar-collapse');

  if (collapse) {
    return;
  }

  const collapseId = 'mainNav';
  const toggler = document.createElement('button');
  toggler.className = 'navbar-toggler';
  toggler.type = 'button';
  toggler.setAttribute('data-bs-toggle', 'collapse');
  toggler.setAttribute('data-bs-target', `#${collapseId}`);
  toggler.setAttribute('aria-controls', collapseId);
  toggler.setAttribute('aria-expanded', 'false');
  toggler.setAttribute('aria-label', 'Toggle navigation');
  toggler.innerHTML = '<span class="navbar-toggler-icon"></span>';

  collapse = document.createElement('div');
  collapse.className = 'collapse navbar-collapse';
  collapse.id = collapseId;
  collapse.appendChild(navList);

  container.appendChild(toggler);
  container.appendChild(collapse);
}

function createRoleNavItem(item, useListItem) {
  const listItem = document.createElement('li');
  listItem.className = 'nav-item';

  if (item.action === 'logout') {
    const button = document.createElement('button');
    button.className = 'btn btn-outline-success btn-sm ms-lg-2';
    button.type = 'button';
    button.textContent = item.label;
    button.setAttribute('data-logout', '');
    button.addEventListener('click', logoutUser);

    if (!useListItem) {
      return button;
    }

    listItem.appendChild(button);
    return listItem;
  }

  const link = document.createElement('a');
  const active = isCurrentPath(item.path) || (item.activePaths || []).some(isCurrentPath);
  link.className = active ? 'nav-link active' : 'nav-link';
  link.href = toAppUrl(item.path);
  link.textContent = item.label;

  if (link.classList.contains('active')) {
    link.setAttribute('aria-current', 'page');
  }

  if (!useListItem) {
    return link;
  }

  listItem.appendChild(link);
  return listItem;
}

// Replaces a link's visible label without touching its element children, so an
// icon nested inside a navigation link survives the update.
function setNavLinkLabel(link, label) {
  const textNodes = Array.prototype.filter.call(link.childNodes, function (node) {
    return node.nodeType === 3 && node.textContent.trim();
  });

  if (!textNodes.length) {
    link.appendChild(document.createTextNode(label));
    return;
  }

  textNodes[0].textContent = label;
  textNodes.slice(1).forEach(function (node) {
    node.remove();
  });
}

// Applies the signed-in/signed-out state to the navigation each page already
// ships, using the data attributes that are already in the markup.
function applyRoleNavigationState(role) {
  const isSignedIn = role === PAMANA_ROLES.contributor || role === PAMANA_ROLES.admin;
  const isAdmin = role === PAMANA_ROLES.admin;
  const dashboardPath = isAdmin ? ROLE_ROUTES.admin : ROLE_ROUTES.contributor;
  const dashboardLabel = isAdmin ? 'Admin Dashboard' : 'Contributor Dashboard';

  document.querySelectorAll('[data-public-account-link]').forEach(function (element) {
    element.classList.toggle('d-none', isSignedIn);
  });

  document.querySelectorAll('[data-dashboard-nav]').forEach(function (element) {
    element.classList.toggle('d-none', !isSignedIn);
  });

  document.querySelectorAll('[data-dashboard-link]').forEach(function (link) {
    link.classList.toggle('d-none', !isSignedIn);

    if (!isSignedIn) {
      return;
    }

    link.href = toAppUrl(dashboardPath);
    setNavLinkLabel(link, dashboardLabel);
  });
}

// One menu per verified profile role, independent of the page's fallback HTML.
// Page-content account links still use applyRoleNavigationState below.
function renderRoleMobileNavigation(role) {
  const items = ROLE_NAV_ITEMS[role].filter(item => !item.action && !(role === 'contributor' && item.path === 'index.html'));
  document.querySelectorAll('.pamana-mobile-nav, .home-bottom-nav').forEach(function (nav) {
    nav.setAttribute('aria-label', `${role === 'visitor' ? 'Public' : role === 'admin' ? 'Administrator' : 'Contributor'} mobile navigation`);
    nav.replaceChildren(...items.map(function (item) {
      const link = createRoleNavItem(item, false);
      link.classList.remove('nav-link');
      link.textContent = item.mobileLabel || item.label;
      link.prepend(createUiIcon(item.icon));
      return link;
    }));
  });
}

let roleNavigationRequest = 0;
async function updateRoleNavigation() {
  const request = ++roleNavigationRequest;
  const navbar = document.querySelector('.navbar');
  const navList = navbar ? navbar.querySelector('.navbar-nav') : null;

  if (navbar && navList) {
    ensureMobileNavbar(navbar);
  }

  let profile = null;

  try {
    profile = await getCurrentUserProfile();
  } catch (error) {
    logAppError('Could not read the session for navigation.', error);
  }

  const role = profile && ROLE_NAV_ITEMS[profile.role] ? profile.role : 'visitor';
  if (request !== roleNavigationRequest) return;

  applyRoleNavigationState(role);
  renderRoleMobileNavigation(role);

  if (!navList) {
    return;
  }

  const useListItem = navList.tagName.toLowerCase() === 'ul';
  navList.className = 'navbar-nav ms-auto align-items-lg-center';
  navList.replaceChildren(...ROLE_NAV_ITEMS[role].map(item => createRoleNavItem(item, useListItem)));
  navbar.dataset.navigationRole = role;
  navbar.setAttribute('aria-label', 'Primary navigation');
  const brand = navbar.querySelector('.pamana-brand');
  if (brand) {
    brand.href = toAppUrl('index.html');
    brand.removeAttribute('aria-current');
    const subtitle = brand.querySelector('.brand-subtitle');
    if (subtitle) subtitle.textContent = 'Our Heritage Lives On';
  }
}

// Only protected pages carry #sessionStatus, and they all require a role.
async function renderSessionStatus() {
  const sessionStatus = document.getElementById('sessionStatus');

  if (!sessionStatus) {
    return;
  }

  try {
    const profile = await getCurrentUserProfile();

    sessionStatus.textContent = profile
      ? `Signed in as ${profile.display_name} (${profile.role})`
      : 'Not signed in.';
  } catch (error) {
    logAppError('Could not read the session status.', error);
    sessionStatus.textContent = 'Session status unavailable.';
  }
}

const registerForm = document.getElementById('registerForm');
const registerMessage = document.getElementById('registerMessage');
const registerButton = document.getElementById('registerButton');

async function handleRegisterSubmit(event) {
  event.preventDefault();
  if (!claimButtonAction(registerButton)) return;
  let completed = false;
  try {
    clearFormValidation(registerForm);
    const displayName = readTrimmedField('displayName');
    const email = readTrimmedField('registerEmail');
    const password = readFieldValue('registerPassword');
    const confirmation = readFieldValue('confirmPassword');
    const errors = {
      displayName: validateRequired(displayName, 'your display name'),
      registerEmail: validateEmail(email),
      registerPassword: validatePassword(password),
      confirmPassword: validateConfirmPassword(password, confirmation)
    };
    if (!reportValidationResult(errors, registerMessage)) return;
    setFormBusy(registerForm, true);
    setSubmitLoading(registerButton, true, 'Creating account...', 'Create Contributor Account');
    showAppMessage(registerMessage, 'Creating your contributor account...', 'info');
    const { data, error } = await registerContributor(displayName, email, password);
    if (error) {
      logAppError('Registration failed.', error);
      showAppMessage(registerMessage, getAppErrorMessage(error, APP_MESSAGES.registrationFailed), 'danger');
      await showSystemErrorFor(error, 'Registration failed', APP_MESSAGES.registrationFailed);
      return;
    }
    completed = true;
    registerForm.reset();
    const message = data && data.session
      ? 'Account created successfully. You can now sign in.'
      : 'Account created. Check your email to confirm your account, then sign in.';
    showAppMessage(registerMessage, message, 'success');
    rememberAppFeedback(message, 'success');
    // Preserve the original post-registration destination. Resolved against the
    // app base so the redirect cannot break if the page is served from a
    // subfolder.
    await showSystemSuccess('Account created', message, 'Go to Login');
    goToAppPage('login.html');
  } catch (error) {
    logAppError('Registration request failed.', error);
    showAppMessage(registerMessage, getAppErrorMessage(error, APP_MESSAGES.registrationFailed), 'danger');
    await showSystemErrorFor(error, 'Registration failed', APP_MESSAGES.registrationFailed);
  } finally {
    setFormBusy(registerForm, false);
    setSubmitLoading(registerButton, false, '', 'Create Contributor Account');
    if (completed) { registerButton.disabled = true; registerButton.textContent = 'Account created'; }
  }
}
if (registerForm) registerForm.addEventListener('submit', handleRegisterSubmit);

const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginButton = document.getElementById('loginButton');

if (loginMessage) {
  try {
    const authMessage = sessionStorage.getItem('pamanaAuthMessage');

    if (authMessage) {
      showAppMessage(loginMessage, authMessage, 'warning');
      sessionStorage.removeItem('pamanaAuthMessage');
    }
  } catch (_) {
    // The login form still works without the carried-over message.
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!claimButtonAction(loginButton)) return;
  let redirecting = false;
  try {
    clearFormValidation(loginForm);
    const email = readTrimmedField('loginEmail');
    const password = readFieldValue('loginPassword');
    // Do not apply the new-account password policy to existing users.
    const errors = { loginEmail: validateEmail(email), loginPassword: password ? '' : 'Password is required.' };
    if (!reportValidationResult(errors, loginMessage)) return;
    setFormBusy(loginForm, true);
    setSubmitLoading(loginButton, true, 'Signing in...', 'Login');
    showAppMessage(loginMessage, 'Signing in securely...', 'info');
    const { error } = await loginUser(email, password);
    if (error) {
      logAppError('Login failed.', error);
      showAppMessage(loginMessage, getAppErrorMessage(error, APP_MESSAGES.loginFailed), 'danger');
      await showSystemErrorFor(error, 'Incorrect email or password', APP_MESSAGES.loginFailed);
      return;
    }
    const profile = await getCurrentUserProfile();
    if (!profile) {
      showAppMessage(loginMessage, APP_MESSAGES.profileUnavailable, 'danger');
      await showSystemError('Account not ready', APP_MESSAGES.profileUnavailable);
      return;
    }
    showAppMessage(loginMessage, 'Signed in. Opening your dashboard...', 'success');
    redirecting = true;
    // The destination is unchanged; it is opened once the visitor acknowledges.
    await showSystemSuccess('Login successful', `Signed in as ${profile.display_name}. Opening your dashboard.`, 'Open Dashboard');
    redirectByRole(profile);
  } catch (error) {
    logAppError('Login request failed.', error);
    showAppMessage(loginMessage, getAppErrorMessage(error, APP_MESSAGES.loginFailed), 'danger');
    await showSystemErrorFor(error, 'Incorrect email or password', APP_MESSAGES.loginFailed);
  } finally {
    setFormBusy(loginForm, false);
    setSubmitLoading(loginButton, false, '', 'Login');
    if (redirecting) { loginButton.disabled = true; loginButton.textContent = 'Opening dashboard...'; }
  }
}
if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

document.querySelectorAll('[data-logout]').forEach(function (button) {
  button.addEventListener('click', logoutUser);
});

updateRoleNavigation();
renderSessionStatus();
applyPageProtection();

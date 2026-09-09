// Auth-facing DOM: role navigation, the session status line, and the login and
// registration form controllers. Session state, guards and protected-page
// rules live in js/session.js.

const MIN_PASSWORD_LENGTH = 6;
const ROLE_NAV_ITEMS = {
  visitor: [
    { label: 'Home', path: 'index.html' },
    { label: 'Browse Heritage', path: 'browse.html' },
    { label: 'Login', path: 'login.html' },
    { label: 'Register', path: 'register.html' }
  ],
  contributor: [
    { label: 'Home', path: 'index.html' },
    { label: 'Browse Heritage', path: 'browse.html' },
    { label: 'Contribute Story', path: 'contribute.html' },
    { label: 'My Submissions', path: 'contributor/submissions.html' },
    { label: 'Dashboard', path: 'contributor/dashboard.html' },
    { label: 'Logout', action: 'logout' }
  ],
  admin: [
    { label: 'Dashboard', path: 'admin/dashboard.html' },
    { label: 'Heritage Sites', path: 'admin/heritage-sites.html' },
    { label: 'Submissions', path: 'admin/submissions.html' },
    { label: 'Story Management', path: 'admin/submissions.html' },
    { label: 'Logout', action: 'logout' }
  ]
};

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isCurrentPath(path) {
  const currentPath = normalizePath(window.location.pathname);
  return currentPath.endsWith(normalizePath(path));
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
    button.className = 'btn btn-outline-light btn-sm ms-lg-3';
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
  link.className = isCurrentPath(item.path) ? 'nav-link active' : 'nav-link';
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

async function updateRoleNavigation() {
  const navbar = document.querySelector('.navbar');
  const navList = navbar ? navbar.querySelector('.navbar-nav') : null;

  if (!navbar || !navList) {
    return;
  }

  ensureMobileNavbar(navbar);

  const profile = await getCurrentUserProfile();
  const role = profile && ROLE_NAV_ITEMS[profile.role] ? profile.role : 'visitor';
  const useListItem = navList.tagName.toLowerCase() === 'ul';

  navList.innerHTML = '';
  ROLE_NAV_ITEMS[role].forEach(function (item) {
    navList.appendChild(createRoleNavItem(item, useListItem));
  });
}

// Only protected pages carry #sessionStatus, and they all require a role.
async function renderSessionStatus() {
  const sessionStatus = document.getElementById('sessionStatus');

  if (!sessionStatus) {
    return;
  }

  const profile = await getCurrentUserProfile();

  if (profile) {
    sessionStatus.textContent = `Signed in as ${profile.display_name} (${profile.role})`;
  }
}

const registerForm = document.getElementById('registerForm');
const registerMessage = document.getElementById('registerMessage');
const registerButton = document.getElementById('registerButton');

if (registerForm) {
  registerForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (!claimButtonAction(registerButton)) {
      return;
    }

    clearFormValidation(registerForm);

    const displayName = readTrimmedField('displayName');
    const email = readTrimmedField('registerEmail');
    const password = readFieldValue('registerPassword');
    const confirmPassword = readFieldValue('confirmPassword');

    const validationErrors = {
      displayName: validateRequired(displayName, 'your display name'),
      registerEmail: validateEmail(email),
      registerPassword: validateMinLength(password, 'a password', MIN_PASSWORD_LENGTH),
      confirmPassword: validateMatchingValues(password, confirmPassword, 'Passwords do not match. Please try again.')
    };

    if (!reportValidationResult(validationErrors, registerMessage)) {
      releaseButtonAction(registerButton);
      return;
    }

    setSubmitLoading(registerButton, true, 'Creating Account...', 'Create Contributor Account');

    const { data, error } = await registerContributor(displayName, email, password);

    if (error) {
      logAppError('Registration failed.', error);
      showAppMessage(registerMessage, getAppErrorMessage(error, APP_MESSAGES.registrationFailed), 'danger');
      setSubmitLoading(registerButton, false, 'Creating Account...', 'Create Contributor Account');
      return;
    }

    registerForm.reset();

    const successMessage = data && data.session
      ? 'Registration successful. Redirecting to login...'
      : 'Registration successful. Check your email to confirm your account, then log in.';

    showAppMessage(registerMessage, successMessage, 'success');

    setTimeout(function () {
      window.location.href = 'login.html';
    }, 1500);
  });
}

const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginButton = document.getElementById('loginButton');

if (loginMessage) {
  const authMessage = sessionStorage.getItem('pamanaAuthMessage');

  if (authMessage) {
    showAppMessage(loginMessage, authMessage, 'warning');
    sessionStorage.removeItem('pamanaAuthMessage');
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (!claimButtonAction(loginButton)) {
      return;
    }

    clearFormValidation(loginForm);

    const email = readTrimmedField('loginEmail');
    const password = readFieldValue('loginPassword');

    const validationErrors = {
      loginEmail: validateEmail(email),
      loginPassword: validateRequired(password, 'your password')
    };

    if (!reportValidationResult(validationErrors, loginMessage)) {
      releaseButtonAction(loginButton);
      return;
    }

    setSubmitLoading(loginButton, true, 'Logging In...', 'Login');

    const { error } = await loginUser(email, password);

    if (error) {
      logAppError('Login failed.', error);
      showAppMessage(loginMessage, APP_MESSAGES.loginFailed, 'danger');
      setSubmitLoading(loginButton, false, 'Logging In...', 'Login');
      return;
    }

    const profile = await getCurrentUserProfile();

    if (!profile) {
      showAppMessage(loginMessage, APP_MESSAGES.profileUnavailable, 'danger');
      setSubmitLoading(loginButton, false, 'Logging In...', 'Login');
      return;
    }

    showAppMessage(loginMessage, 'Login successful. Redirecting...', 'success');
    await redirectByRole(profile);
  });
}

document.querySelectorAll('[data-logout]').forEach(function (button) {
  button.addEventListener('click', logoutUser);
});

updateRoleNavigation();
renderSessionStatus();
applyPageProtection();

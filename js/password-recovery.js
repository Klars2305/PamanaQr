// Loaded before supabase.js on the two NEW recovery pages, so we can recognize
// the original recovery fragment before the SDK consumes it. No tokens are
// printed, stored separately, or sent anywhere except by the Supabase SDK.
(function () {
  'use strict';
  const incomingUrl = new URL(window.location.href);
  const incomingHash = new URLSearchParams(incomingUrl.hash.slice(1));
  const incomingToken = incomingHash.get('type') === 'recovery' ? incomingHash.get('access_token') : '';
  const incomingError = incomingHash.has('error') || incomingHash.has('error_code') || incomingUrl.searchParams.has('error');
  const markerKey = 'pamanaRecoveryContext';
  let recoveryUserId = '';
  let finished = false;
  let checking = false;
  let receivedRecoverySession = null;
  let subscription = null;

  function clearMarker() {
    try { sessionStorage.removeItem(markerKey); } catch (_) { /* Optional reload convenience. */ }
  }
  function saveMarker(session) {
    try {
      sessionStorage.setItem(markerKey, JSON.stringify({
        userId: session.user.id, sessionExpiresAt: session.expires_at,
        until: Date.now() + 15 * 60 * 1000
      }));
    } catch (_) { /* The initial recovery still works without storage. */ }
  }
  function markerMatches(session) {
    try {
      const marker = JSON.parse(sessionStorage.getItem(markerKey) || 'null');
      return marker && marker.userId === session.user.id && marker.sessionExpiresAt === session.expires_at && marker.until > Date.now();
    } catch (_) { return false; }
  }
  function cleanRecoveryUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    ['code', 'error', 'error_code', 'error_description'].forEach(key => url.searchParams.delete(key));
    window.history.replaceState({}, document.title, url.pathname + url.search);
  }
  function setRecoveryAvailable(available) {
    const fields = document.getElementById('resetPasswordFields');
    if (fields) fields.disabled = !available;
  }
  function denyRecovery(message) {
    recoveryUserId = '';
    clearMarker();
    setRecoveryAvailable(false);
    showAppMessage('resetPasswordMessage', message || APP_MESSAGES.invalidRecovery, 'warning');
  }
  async function checkRecoverySession() {
    if (checking || finished) return;
    checking = true;
    const client = getSupabaseClient();
    try {
      if (!client) { denyRecovery(APP_MESSAGES.notConfigured); return; }
      const { data, error } = await client.auth.getSession();
      const session = data && data.session;
      if (incomingError || error || !session || !session.user) { denyRecovery(); return; }
      const sameIncomingToken = incomingToken && incomingToken === session.access_token;
      const sameRecoveryEvent = receivedRecoverySession && receivedRecoverySession.access_token === session.access_token;
      if (!sameIncomingToken && !sameRecoveryEvent && !markerMatches(session)) { denyRecovery(); return; }
      // The marker is ONLY a UI gate. Server-verified identity and Supabase Auth
      // authorization, not sessionStorage, authorize the password update.
      const verified = await client.auth.getUser();
      if (verified.error || !verified.data.user || verified.data.user.id !== session.user.id) { denyRecovery(); return; }
      recoveryUserId = verified.data.user.id;
      saveMarker(session);
      setRecoveryAvailable(true);
      showAppMessage('resetPasswordMessage', 'Reset link verified. Choose a new password below.', 'info');
    } catch (error) {
      denyRecovery(getAppErrorMessage(error, APP_MESSAGES.invalidRecovery));
    } finally {
      checking = false;
      cleanRecoveryUrl();
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById('forgotPasswordButton');
    if (!claimButtonAction(button)) return;
    try {
      clearFormValidation(form);
      const email = readTrimmedField('forgotPasswordEmail');
      if (!reportValidationResult({ forgotPasswordEmail: validateEmail(email) }, 'forgotPasswordMessage')) return;
      setFormBusy(form, true);
      setSubmitLoading(button, true, 'Sending reset link...', 'Send Reset Link');
      showAppMessage('forgotPasswordMessage', 'Sending reset link...', 'info');
      const client = getSupabaseClient();
      if (!client) throw createAppError(APP_MESSAGES.notConfigured);
      // Validate again immediately before the Auth request. No arbitrary return URL.
      const invalid = validateEmail(email);
      if (invalid) throw createAppError(invalid);
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: toAppUrl('reset-password.html') });
      if (error && !['user_not_found', 'identity_not_found'].includes(error.code)) throw error;
      showAppMessage('forgotPasswordMessage', APP_MESSAGES.recoverySent + ' Check your inbox and spam folder.', 'success');
      // Deliberately not a success message: whether an account exists is not
      // disclosed, so this reports what was done, not what was found.
      await showSystemInfo('Password reset email sent', APP_MESSAGES.recoverySent + ' Check your inbox and spam folder.', 'OK');
    } catch (error) {
      logAppError('Password reset link request failed.', error);
      showAppMessage('forgotPasswordMessage', getAppErrorMessage(error, 'We could not send the reset link. Please try again.'), 'danger');
      await showSystemErrorFor(error, 'Reset link not sent', 'We could not send the reset link. Please try again.');
    } finally {
      setFormBusy(form, false);
      setSubmitLoading(button, false, '', 'Send Reset Link');
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById('resetPasswordButton');
    if (finished || !recoveryUserId || !claimButtonAction(button)) return;
    try {
      clearFormValidation(form);
      const password = readFieldValue('newPassword');
      const confirmation = readFieldValue('confirmNewPassword');
      const errors = { newPassword: validatePassword(password), confirmNewPassword: validateConfirmPassword(password, confirmation) };
      if (!reportValidationResult(errors, 'resetPasswordMessage')) return;
      setFormBusy(form, true);
      setSubmitLoading(button, true, 'Updating password...', 'Update Password');
      showAppMessage('resetPasswordMessage', 'Updating your password securely...', 'info');
      const client = getSupabaseClient();
      if (!client) throw createAppError(APP_MESSAGES.notConfigured);
      const verified = await client.auth.getUser();
      if (verified.error || !verified.data.user || verified.data.user.id !== recoveryUserId) {
        denyRecovery(); return;
      }
      // Same shared rule directly before updateUser, not a custom password store.
      const invalid = validatePassword(password) || validateConfirmPassword(password, confirmation);
      if (invalid) throw createAppError(invalid);
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      finished = true;
      clearMarker();
      form.reset();
      setRecoveryAvailable(false);
      // End only this recovery session. Do not invent localStorage auth logic.
      const signOut = await client.auth.signOut({ scope: 'local' });
      if (typeof clearSessionCache === 'function') clearSessionCache();
      if (signOut.error) {
        showAppMessage('resetPasswordMessage', APP_MESSAGES.passwordUpdated + ' We could not sign out this session. Please sign out before using a shared device.', 'warning');
        await showSystemWarning('Password updated', APP_MESSAGES.passwordUpdated + ' We could not sign out this session. Please sign out before using a shared device.');
      } else {
        showAppMessage('resetPasswordMessage', APP_MESSAGES.passwordUpdated + ' Return to Login to sign in.', 'success');
        await showSystemSuccess('Password updated', APP_MESSAGES.passwordUpdated + ' Return to Login to sign in.', 'Go to Login');
      }
      const returnToLogin = document.getElementById('resetReturnToLogin');
      if (returnToLogin) returnToLogin.focus();
    } catch (error) {
      logAppError('Password update failed.', error);
      const message = getAppErrorMessage(error, 'We could not update your password. Please try again or request a new reset link.');
      showAppMessage('resetPasswordMessage', finished ? APP_MESSAGES.passwordUpdated + ' Please sign out before using a shared device.' : message, finished ? 'warning' : 'danger');
      await (finished
        ? showSystemWarning('Password updated', APP_MESSAGES.passwordUpdated + ' Please sign out before using a shared device.')
        : showSystemErrorFor(error, 'Password not updated', message));
    } finally {
      setFormBusy(form, false);
      setSubmitLoading(button, false, '', 'Update Password');
      if (finished && button) { setRecoveryAvailable(false); button.disabled = true; button.textContent = 'Password updated'; }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const forgot = document.getElementById('forgotPasswordForm');
    if (forgot) forgot.addEventListener('submit', handleForgotPassword);
    const reset = document.getElementById('resetPasswordForm');
    if (!reset) return;
    reset.addEventListener('submit', handleResetPassword);
    setRecoveryAvailable(false);
    showAppMessage('resetPasswordMessage', 'Checking your reset link...', 'info');
    const client = getSupabaseClient();
    if (client) {
      const listener = client.auth.onAuthStateChange(function (event, session) {
        // Never await another Auth call inside this callback (SDK lock).
        if (event === 'PASSWORD_RECOVERY' && session) {
          receivedRecoverySession = session;
          setTimeout(checkRecoverySession, 0);
        } else if (event === 'SIGNED_OUT' && !finished) {
          denyRecovery();
        }
      });
      subscription = listener && listener.data ? listener.data.subscription : null;
    }
    checkRecoverySession();
  });
  window.addEventListener('pagehide', function () { if (subscription) subscription.unsubscribe(); });
})();

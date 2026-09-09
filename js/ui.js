// Reusable interaction helpers. No database calls, permissions, or route changes.
const busyFormFields = new WeakMap();
function setFormBusy(form, busy) {
  if (!form) return;
  if (busy && !busyFormFields.has(form)) {
    const fields = Array.from(form.querySelectorAll('input, select, textarea, [data-password-toggle], [data-remove-selected-photo]'));
    busyFormFields.set(form, fields.map(field => [field, field.disabled]));
    fields.forEach(field => { field.disabled = true; });
    form.dataset.busy = 'true';
    // The cleanup branch always removed aria-busy but nothing ever set it, so
    // a working form never announced that it was working.
    form.setAttribute('aria-busy', 'true');
  } else if (!busy) {
    (busyFormFields.get(form) || []).forEach(([field, disabled]) => { field.disabled = disabled; });
    busyFormFields.delete(form);
    form.removeAttribute('aria-busy');
    delete form.dataset.busy;
  }
}

function showGlobalFeedback(message, tone) {
  let target = document.getElementById('pamanaGlobalFeedback');
  if (!target) {
    target = document.createElement('div');
    target.id = 'pamanaGlobalFeedback';
    (document.querySelector('main') || document.body).prepend(target);
  }
  showAppMessage(target, message, tone || 'warning');
}
function appendAppLink(messageTarget, path, label) {
  const target = typeof messageTarget === 'string' ? document.getElementById(messageTarget) : messageTarget;
  if (!target) return;
  const link = document.createElement('a');
  link.href = toAppUrl(path);
  link.className = 'pamana-feedback-link';
  link.textContent = label;
  target.appendChild(link);
}
function rememberAppFeedback(message, type) {
  try { sessionStorage.setItem('pamanaFlash', JSON.stringify({ message, type })); } catch (_) { /* Optional feedback only. */ }
}
function restoreAppFeedback() {
  try {
    const raw = sessionStorage.getItem('pamanaFlash');
    if (!raw) return;
    sessionStorage.removeItem('pamanaFlash');
    const flash = JSON.parse(raw);
    if (typeof flash.message === 'string') showGlobalFeedback(flash.message, flash.type);
  } catch (_) { /* No persistent state is needed for the application to work. */ }
}

// Shared by both dialogs. Opening a modal while another is on screen is what
// leaves a stranded backdrop behind, so callers wait instead of stacking.
function waitForModalToHide(modal) {
  return new Promise(function (resolve) {
    modal.addEventListener('hidden.bs.modal', function () {
      resolve();
    }, { once: true });
  });
}
function getOpenModalOtherThan(modal) {
  const open = document.querySelector('.modal.show');
  return open && open !== modal ? open : null;
}

const CONFIRM_VARIANTS = {
  success: 'btn-success',
  danger: 'btn-danger',
  warning: 'btn-warning',
  primary: 'btn-primary'
};

let activeConfirmation = false;
function getConfirmationModal() {
  let modal = document.getElementById('pamanaConfirmModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'pamanaConfirmModal';
  modal.className = 'modal fade pamana-modal';
  modal.tabIndex = -1;
  modal.setAttribute('role', 'alertdialog');
  modal.setAttribute('aria-labelledby', 'pamanaConfirmTitle');
  modal.setAttribute('aria-describedby', 'pamanaConfirmDescription');
  modal.setAttribute('aria-hidden', 'true');
  // Static developer-authored markup only. All variable text is assigned below.
  setSafeHtml(modal, trustedHtml(`
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title fs-4" id="pamanaConfirmTitle"></h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close confirmation"></button>
        </div>
        <div class="modal-body"><p id="pamanaConfirmDescription" class="mb-0"></p></div>
        <div class="modal-footer pamana-confirm-actions">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="pamanaConfirmCancel">Cancel</button>
          <button type="button" class="btn btn-success" id="pamanaConfirmAccept"></button>
        </div>
      </div>
    </div>`));
  document.body.appendChild(modal);
  return modal;
}
// Puts one decision on screen and waits for it. Escape, the backdrop, Close and
// Cancel all mean no. Only #pamanaConfirmModal is ever used, so there is one
// element, one Bootstrap instance and one backdrop no matter how often it runs.
//
// Resolves to true only after the dialog has closed AND onConfirm has finished.
// An error thrown by onConfirm propagates to the caller untouched, so existing
// try/catch/finally blocks keep working exactly as they did.
async function showConfirmationModal({
  title,
  message,
  confirmText,
  cancelText,
  variant = 'success',
  onConfirm,
  trigger = document.activeElement
}) {
  // A decision already on screen, or work still running from one, wins.
  if (activeConfirmation) return false;
  if (!window.bootstrap || !window.bootstrap.Modal) {
    showGlobalFeedback(APP_MESSAGES.confirmUnavailable, 'danger');
    return false;
  }

  activeConfirmation = true;

  try {
    const modal = getConfirmationModal();
    const openModal = getOpenModalOtherThan(modal);

    if (openModal) {
      await waitForModalToHide(openModal);
    }

    const accept = modal.querySelector('#pamanaConfirmAccept');
    const cancel = modal.querySelector('#pamanaConfirmCancel');

    modal.querySelector('#pamanaConfirmTitle').textContent = title;
    modal.querySelector('#pamanaConfirmDescription').textContent = message;
    accept.textContent = confirmText;
    accept.className = `btn ${CONFIRM_VARIANTS[variant] || CONFIRM_VARIANTS.success}`;
    accept.disabled = false;
    cancel.textContent = cancelText || 'Cancel';

    const dialog = bootstrap.Modal.getOrCreateInstance(modal);
    const confirmed = await new Promise(function (resolve) {
      let decided = false;
      // Claimed on the first click. A second click on a dialog that is already
      // closing cannot register the decision twice.
      const onAccept = function () {
        if (decided) return;
        decided = true;
        accept.disabled = true;
        dialog.hide();
      };
      const onShown = function () {
        // Bootstrap sets role="dialog" as it opens; this dialog demands an
        // answer, so restore alertdialog. Focus starts on the safe choice.
        modal.setAttribute('role', 'alertdialog');
        cancel.focus();
      };
      const onHidden = function () {
        accept.removeEventListener('click', onAccept);
        modal.removeEventListener('shown.bs.modal', onShown);
        modal.removeEventListener('hidden.bs.modal', onHidden);
        accept.disabled = false;
        resolve(decided);
        // The caller restores its action buttons in its finally block first.
        requestAnimationFrame(function () {
          if (trigger && trigger.isConnected && !trigger.disabled) trigger.focus();
        });
      };

      accept.addEventListener('click', onAccept);
      modal.addEventListener('shown.bs.modal', onShown);
      modal.addEventListener('hidden.bs.modal', onHidden);

      try {
        dialog.show();
      } catch (error) {
        onHidden();
        logAppError('Confirmation dialog failed.', error);
        showGlobalFeedback(APP_MESSAGES.confirmUnavailable, 'danger');
      }
    });

    if (confirmed && typeof onConfirm === 'function') {
      await onConfirm();
    }

    return confirmed;
  } finally {
    // Released even when onConfirm throws, so the dialog is never left blocked.
    activeConfirmation = false;
  }
}

// Kept so any caller still using the original option names keeps working.
function confirmAction({ title, message, confirmLabel, tone, trigger }) {
  return showConfirmationModal({
    title: title,
    message: message,
    confirmText: confirmLabel,
    variant: tone,
    trigger: trigger
  });
}

function createUiIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'pamana-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', toAppUrl(`assets/icons/sprite.svg#${name}`));
  svg.appendChild(use);
  return svg;
}
function hidePassword(field, toggle) {
  field.type = 'password';
  toggle.setAttribute('aria-label', 'Show password');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.replaceChildren(createUiIcon('eye'));
}
function enhancePasswordField(field) {
  if (field.closest('.pamana-password-field')) return;
  const wrap = document.createElement('div');
  wrap.className = 'pamana-password-field';
  field.insertAdjacentElement('beforebegin', wrap);
  wrap.appendChild(field);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pamana-password-toggle';
  toggle.dataset.passwordToggle = field.id;
  toggle.setAttribute('aria-controls', field.id);
  hidePassword(field, toggle);
  wrap.appendChild(toggle);
  toggle.addEventListener('click', function () {
    const show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(show));
    toggle.replaceChildren(createUiIcon(show ? 'eye-slash' : 'eye'));
  });
  if (field.form) field.form.addEventListener('reset', () => hidePassword(field, toggle));
  window.addEventListener('pagehide', () => hidePassword(field, toggle));
}
function updatePasswordChecklist(field) {
  const list = document.querySelector(`[data-password-rules="${field.id}"]`);
  if (!list) return;
  const checks = passwordChecks(field.value);
  list.querySelectorAll('[data-password-rule]').forEach(function (item) {
    const met = checks[item.dataset.passwordRule];
    item.classList.toggle('requirement-met', met);
    const label = item.querySelector('.requirement-status');
    if (label) label.textContent = met ? 'Met' : 'Not yet met';
  });
}
function enhanceCharacterCounter(field, limits) {
  const id = `${field.id}Counter`;
  let counter = document.getElementById(id);
  if (!counter) {
    counter = document.createElement('p');
    counter.id = id;
    counter.className = 'form-text pamana-character-counter';
    field.insertAdjacentElement('afterend', counter);
    const refs = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    refs.add(id);
    field.setAttribute('aria-describedby', [...refs].join(' '));
  }
  const update = function () {
    // Same trim and length measurement used when saving; internal line breaks stay intact.
    const length = field.value.trim().length;
    counter.textContent = `${length} / ${limits.max} characters` + (length > limits.max ? ' - please shorten this text.' : ` (minimum ${limits.min}).`);
    counter.classList.toggle('text-danger', length > limits.max);
  };
  field.addEventListener('input', update);
  if (field.form) field.form.addEventListener('reset', () => setTimeout(update, 0));
  update();
}
function fieldValidationRule(field) {
  const value = field.value;
  if (field.type === 'email') return validateEmail(value);
  if (['registerPassword', 'newPassword'].includes(field.id)) return validatePassword(value);
  if (field.id === 'confirmPassword') return validateConfirmPassword(readFieldValue('registerPassword'), value);
  if (field.id === 'confirmNewPassword') return validateConfirmPassword(readFieldValue('newPassword'), value);
  if (field.id === 'storyTitle') return validateTextLength(value, 'Story title', FORM_LIMITS.storyTitle);
  if (field.id === 'storyContent') return validateStoryContent(value);
  if (field.id === 'siteName') return validateTextLength(value, 'Heritage name', FORM_LIMITS.siteName);
  if (field.id === 'shortDescription') return validateTextLength(value, 'Short description', FORM_LIMITS.shortDescription);
  if (field.id === 'siteStatus') return validateAllowedValue(value, SITE_STATUS_VALUES, 'status');
  if (['suggestedClassification', 'finalClassification'].includes(field.id)) {
    return field.required || value ? validateAllowedValue(value, STORY_CLASSIFICATIONS, 'classification') : '';
  }
  if (field.type === 'file') return validateImageInput(field, field.required);
  return field.required ? validateRequired(value, field.labels && field.labels[0] ? field.labels[0].textContent.replace('*', '').trim().toLowerCase() : 'this field') : '';
}

function enhanceImagePreview(input) {
  if (document.getElementById(`${input.id}Preview`)) return;
  const figure = document.createElement('figure');
  figure.id = `${input.id}Preview`;
  figure.className = 'pamana-file-preview d-none';
  const image = document.createElement('img');
  image.alt = 'Preview of the selected photo';
  const caption = document.createElement('figcaption');
  const name = document.createElement('span');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-outline-secondary btn-sm';
  remove.dataset.removeSelectedPhoto = input.id;
  remove.textContent = 'Remove selected photo';
  caption.append(name, remove);
  figure.append(image, caption);
  input.insertAdjacentElement('afterend', figure);
  let objectUrl = '';
  let selection = 0;
  const clear = function () {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    image.removeAttribute('src');
    figure.classList.add('d-none');
  };
  input.addEventListener('change', async function () {
    const version = ++selection;
    clear();
    const file = input.files[0];
    if (!file) {
      input.classList.remove('is-invalid', 'is-valid');
      input.removeAttribute('aria-invalid');
      const feedback = getOrCreateFeedbackElement(input);
      feedback.textContent = ''; feedback.classList.remove('d-block');
      return;
    }
    const error = await validateImageContents(file);
    if (version !== selection) return;
    if (error) { showFieldError(input.id, error); return; }
    showFieldSuccess(input.id);
    objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    name.textContent = `${file.name} - ${(file.size / 1024 / 1024).toFixed(2)} MB. Not uploaded yet.`;
    figure.classList.remove('d-none');
  });
  remove.addEventListener('click', function () {
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  });
  if (input.form) input.form.addEventListener('reset', function () { ++selection; clear(); });
  window.addEventListener('pagehide', clear);
}
function initializeInteractionHelpers() {
  document.querySelectorAll('input[type="password"]').forEach(enhancePasswordField);
  document.querySelectorAll('[data-password-requirements]').forEach(function (field) {
    const update = function () { updatePasswordChecklist(field); };
    field.addEventListener('input', update);
    if (field.form) field.form.addEventListener('reset', () => setTimeout(update, 0));
    update();
  });
  Object.entries(FORM_LIMITS).forEach(function ([id, limits]) {
    const field = document.getElementById(id);
    if (field && /^(INPUT|TEXTAREA)$/.test(field.tagName)) enhanceCharacterCounter(field, limits);
  });
  document.querySelectorAll('input, select, textarea').forEach(function (field) {
    if (field.readOnly || !field.id || field.type === 'file') return;
    field.addEventListener('blur', function () {
      if (field.type === 'email') field.value = field.value.trim();
      if (!field.value && !field.classList.contains('is-invalid')) return;
      const error = fieldValidationRule(field);
      if (error) showFieldError(field.id, error); else showFieldSuccess(field.id);
    });
    field.addEventListener('input', function () {
      if (field.classList.contains('is-invalid')) {
        const error = fieldValidationRule(field);
        if (!error) showFieldSuccess(field.id);
      }
      if (field.id === 'registerPassword' || field.id === 'newPassword') {
        const confirm = document.getElementById(field.id === 'newPassword' ? 'confirmNewPassword' : 'confirmPassword');
        if (confirm && confirm.value) {
          const error = validateConfirmPassword(field.value, confirm.value);
          if (error) showFieldError(confirm.id, error); else showFieldSuccess(confirm.id);
        }
      }
    });
  });
  document.querySelectorAll('input[type="file"]').forEach(enhanceImagePreview);
  document.querySelectorAll('form').forEach(form => form.addEventListener('reset', () => clearFormValidation(form)));
  document.querySelectorAll('nav .active, .admin-sidebar .active').forEach(link => link.setAttribute('aria-current', 'page'));
  restoreAppFeedback();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeInteractionHelpers);
else initializeInteractionHelpers();

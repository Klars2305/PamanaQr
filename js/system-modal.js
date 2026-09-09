// One notification dialog for the whole application.
//
// Every page shares a single #systemFeedbackModal element, created on first use
// and reused afterwards. There is no per-page notification markup and no second
// instance, which is what keeps Bootstrap from stacking a second backdrop.
//
// This file reports outcomes. It never decides them: no Supabase calls, no
// permission checks, no navigation. Callers keep their own control flow and
// simply await the dialog when they need the visitor to acknowledge it first.

const SYSTEM_MODAL_ID = 'systemFeedbackModal';

// Each status carries a distinct shape and a written label as well as a colour,
// so the meaning survives for a visitor who cannot distinguish the four hues.
const SYSTEM_MODAL_TYPES = {
  success: {
    label: 'Success',
    buttonClass: 'btn-success',
    defaultTitle: 'Success',
    defaultButton: 'Continue',
    // Circle with a check.
    icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M7.5 12.4l3 3 6-6.4']
  },
  error: {
    label: 'Error',
    buttonClass: 'btn-danger',
    defaultTitle: 'Something went wrong',
    defaultButton: 'Close',
    // Circle with a cross.
    icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M8.6 8.6l6.8 6.8', 'M15.4 8.6l-6.8 6.8']
  },
  warning: {
    label: 'Warning',
    buttonClass: 'btn-warning',
    defaultTitle: 'Please check this',
    defaultButton: 'Go Back',
    // Triangle with an exclamation.
    icon: ['M12 3.2L1.8 20.8h20.4L12 3.2z', 'M12 9.4v4.4', 'M12 17.1v.1']
  },
  info: {
    label: 'Information',
    buttonClass: 'btn-primary',
    defaultTitle: 'Information',
    defaultButton: 'OK',
    // Circle with an information mark.
    icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 10.8v6', 'M12 7.4v.1']
  }
};

function getSystemModalType(type) {
  return SYSTEM_MODAL_TYPES[type] || SYSTEM_MODAL_TYPES.info;
}

function createSystemModalIcon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'system-modal-glyph');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  paths.forEach(function (definition) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', definition);
    svg.appendChild(path);
  });

  return svg;
}

// Built once. Static developer-authored markup only; every variable value is
// assigned with textContent below, never interpolated into this string.
function getSystemModal() {
  let modal = document.getElementById(SYSTEM_MODAL_ID);

  if (modal) {
    return modal;
  }

  modal = document.createElement('div');
  modal.id = SYSTEM_MODAL_ID;
  modal.className = 'modal fade pamana-modal system-modal';
  modal.tabIndex = -1;
  modal.setAttribute('role', 'alertdialog');
  modal.setAttribute('aria-labelledby', 'systemFeedbackTitle');
  modal.setAttribute('aria-describedby', 'systemFeedbackMessage');
  modal.setAttribute('aria-hidden', 'true');
  setSafeHtml(modal, trustedHtml(`
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-body system-modal-body">
          <p class="system-modal-status" id="systemFeedbackStatus">
            <span class="system-modal-icon" id="systemFeedbackIcon"></span>
            <span class="system-modal-status-label" id="systemFeedbackStatusLabel"></span>
          </p>
          <h2 class="system-modal-title" id="systemFeedbackTitle"></h2>
          <p class="system-modal-message" id="systemFeedbackMessage"></p>
        </div>
        <div class="modal-footer system-modal-actions">
          <button type="button" class="btn" id="systemFeedbackButton" data-bs-dismiss="modal"></button>
        </div>
      </div>
    </div>`));
  document.body.appendChild(modal);
  return modal;
}

// waitForModalToHide and getOpenModalOtherThan are shared with the confirmation
// dialog and live in js/ui.js, which loads first. Showing a second modal over an
// open one is what produces a stranded backdrop, so we queue instead of stack.

function hasBootstrapModal() {
  return Boolean(window.bootstrap && window.bootstrap.Modal);
}

function applySystemModalContent(modal, settings) {
  const preset = getSystemModalType(settings.type);
  const icon = modal.querySelector('#systemFeedbackIcon');
  const button = modal.querySelector('#systemFeedbackButton');

  modal.dataset.systemModalType = SYSTEM_MODAL_TYPES[settings.type] ? settings.type : 'info';
  modal.querySelector('#systemFeedbackStatusLabel').textContent = preset.label;
  modal.querySelector('#systemFeedbackTitle').textContent = settings.title || preset.defaultTitle;
  modal.querySelector('#systemFeedbackMessage').textContent = settings.message || '';
  icon.replaceChildren(createSystemModalIcon(preset.icon));
  button.className = `btn ${preset.buttonClass}`;
  button.textContent = settings.buttonText || preset.defaultButton;

  return button;
}

async function presentSystemModal(settings) {
  // Without Bootstrap there is no dialog to open. Fall back to the page's own
  // feedback banner rather than a browser dialog.
  if (!hasBootstrapModal()) {
    showGlobalFeedback(
      [settings.title, settings.message].filter(Boolean).join(' '),
      settings.type === 'error' ? 'danger' : settings.type || 'info'
    );
    return;
  }

  const modal = getSystemModal();
  const openModal = getOpenModalOtherThan(modal);

  if (openModal) {
    await waitForModalToHide(openModal);
  }

  const trigger = settings.trigger || document.activeElement;
  const button = applySystemModalContent(modal, settings);
  const dialog = bootstrap.Modal.getOrCreateInstance(modal);

  return new Promise(function (resolve) {
    const onShown = function () {
      // Bootstrap sets role="dialog" as it opens. This dialog reports an
      // outcome and must be acknowledged, so restore the alertdialog role.
      modal.setAttribute('role', 'alertdialog');
      button.focus();
    };
    const onHidden = function () {
      modal.removeEventListener('shown.bs.modal', onShown);
      modal.removeEventListener('hidden.bs.modal', onHidden);
      resolve();

      if (settings.returnFocus === false) {
        return;
      }

      // Focus returns only after the caller has finished re-enabling controls.
      requestAnimationFrame(function () {
        if (trigger && trigger.isConnected && !trigger.disabled) {
          trigger.focus();
        }
      });
    };

    modal.addEventListener('shown.bs.modal', onShown);
    modal.addEventListener('hidden.bs.modal', onHidden);

    try {
      dialog.show();
    } catch (error) {
      onHidden();
      logAppError('Notification dialog failed.', error);
      showGlobalFeedback(
        [settings.title, settings.message].filter(Boolean).join(' '),
        settings.type === 'error' ? 'danger' : settings.type || 'info'
      );
    }
  });
}

// Notifications are serialised. Two results arriving close together open one
// dialog after the other instead of fighting over a single backdrop.
let systemModalQueue = Promise.resolve();

function showSystemModal(settings) {
  const options = settings || {};
  const present = function () {
    return presentSystemModal(options);
  };

  systemModalQueue = systemModalQueue.then(present, present);
  return systemModalQueue;
}

// Convenience wrappers so call sites read as the outcome they report.
function showSystemSuccess(title, message, buttonText) {
  return showSystemModal({ type: 'success', title: title, message: message, buttonText: buttonText });
}

function showSystemError(title, message, buttonText) {
  return showSystemModal({ type: 'error', title: title, message: message, buttonText: buttonText });
}

function showSystemWarning(title, message, buttonText) {
  return showSystemModal({ type: 'warning', title: title, message: message, buttonText: buttonText });
}

function showSystemInfo(title, message, buttonText) {
  return showSystemModal({ type: 'info', title: title, message: message, buttonText: buttonText });
}

// Maps a caught error onto the right status. A refused permission is a warning
// the visitor can act on; everything else is reported as an error.
function showSystemErrorFor(error, title, fallbackMessage) {
  const message = getAppErrorMessage(error, fallbackMessage);
  const isPermission = message === APP_MESSAGES.unauthorized
    || message === APP_MESSAGES.unauthorizedSubmission
    || message === APP_MESSAGES.unauthorizedAdminAction
    || message === APP_MESSAGES.sessionExpired;

  return showSystemModal({
    type: isPermission ? 'warning' : 'error',
    title: isPermission ? 'Unauthorized action' : title,
    message: message
  });
}

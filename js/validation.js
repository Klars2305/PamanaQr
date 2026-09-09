/* ---------------------------------------------------------------------------
 * Reading form fields
 * ------------------------------------------------------------------------ */

function readTrimmedField(elementId) {
  const element = document.getElementById(elementId);
  return element ? element.value.trim() : '';
}

// Untrimmed, for selects and for passwords where whitespace is significant.
function readFieldValue(elementId) {
  const element = document.getElementById(elementId);
  return element ? element.value : '';
}

function readCheckedField(elementId) {
  const element = document.getElementById(elementId);
  return Boolean(element && element.checked);
}

function readChosenFile(elementId) {
  const element = document.getElementById(elementId);
  return element ? element.files[0] || null : null;
}

/* ---------------------------------------------------------------------------
 * Field rules
 * ------------------------------------------------------------------------ */

function validateRequired(value, fieldName) {
  return value ? '' : `Please enter ${fieldName}.`;
}

function validateEmail(value) {
  if (!value) {
    return 'Please enter your email address.';
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? ''
    : 'Please enter a valid email address.';
}

function validateMinLength(value, fieldName, minimumLength) {
  if (!value) {
    return `Please enter ${fieldName}.`;
  }

  return value.length >= minimumLength
    ? ''
    : `Please use ${fieldName} with at least ${minimumLength} characters.`;
}

function validateMatchingValues(value, matchingValue, message) {
  return value === matchingValue ? '' : message;
}

function validateAllowedValue(value, allowedValues, fieldName) {
  return allowedValues.includes(value) ? '' : `Please choose a valid ${fieldName}.`;
}

function validateOptionalUrlOrText(value, fieldName) {
  if (!value) {
    return '';
  }

  if (value.length < 3) {
    return `Please enter a more complete ${fieldName}.`;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      new URL(value);
    } catch (error) {
      return `Please enter a valid ${fieldName} URL.`;
    }
  }

  return '';
}

function validateImageInput(fileInput, required) {
  if (!fileInput) {
    return '';
  }

  const file = fileInput.files[0];

  if (!file && required) {
    return 'Please choose an image.';
  }

  if (!file) {
    return '';
  }

  return validateImageFile(file);
}

function getOrCreateFeedbackElement(field) {
  let feedback = field.parentElement.querySelector('.invalid-feedback');

  if (!feedback) {
    feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    field.parentElement.appendChild(feedback);
  }

  return feedback;
}

function showFieldError(elementId, message) {
  const field = document.getElementById(elementId);

  if (!field) {
    return;
  }

  const feedback = getOrCreateFeedbackElement(field);
  field.classList.add('is-invalid');
  field.classList.remove('is-valid');
  feedback.textContent = message;
}

function showFieldSuccess(elementId) {
  const field = document.getElementById(elementId);

  if (!field) {
    return;
  }

  field.classList.remove('is-invalid');
  field.classList.add('is-valid');
}

function clearFormValidation(form) {
  if (!form) {
    return;
  }

  form.querySelectorAll('.is-invalid, .is-valid').forEach(function (field) {
    field.classList.remove('is-invalid', 'is-valid');
  });
}

function applyValidationResult(validationErrors) {
  const errorIds = Object.keys(validationErrors).filter(function (fieldId) {
    return validationErrors[fieldId];
  });

  Object.keys(validationErrors).forEach(function (fieldId) {
    if (validationErrors[fieldId]) {
      showFieldError(fieldId, validationErrors[fieldId]);
    } else {
      showFieldSuccess(fieldId);
    }
  });

  if (errorIds.length) {
    const firstInvalidField = document.getElementById(errorIds[0]);

    if (firstInvalidField) {
      firstInvalidField.focus();
    }
  }

  return errorIds.length === 0;
}

// Applies a validation result and reports the standard warning when it fails.
// Used by every form so the wording stays identical across the app.
function reportValidationResult(validationErrors, messageTarget) {
  if (applyValidationResult(validationErrors)) {
    return true;
  }

  showAppMessage(messageTarget, 'Please fix the highlighted fields.', 'warning');
  return false;
}

function setSubmitLoading(button, isLoading, loadingText, normalText) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
}

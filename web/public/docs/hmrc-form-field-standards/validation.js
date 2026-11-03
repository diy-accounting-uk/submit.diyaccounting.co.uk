/**
 * UK Tax Form Field Validation
 *
 * Demonstrates validation patterns for HMRC tax reference fields.
 * These patterns match HMRC's expected formats for API submissions.
 */

// ============================================
// Utility Functions
// ============================================

/**
 * Normalise input by removing spaces and converting to uppercase
 */
function normalise(value) {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Fill an error element with the hidden "Error: " prefix and the message as text
 */
function setErrorText(errorEl, message) {
  const prefix = document.createElement('span');
  prefix.className = 'visually-hidden';
  prefix.textContent = 'Error: ';
  errorEl.replaceChildren(prefix, document.createTextNode(message));
}

/**
 * Show error message on a form group
 */
function showFieldError(groupId, inputId, message) {
  const group = document.getElementById(groupId);
  const input = document.getElementById(inputId);

  // Remove any existing error
  clearFieldError(groupId, inputId);

  // Add error class
  group.classList.add('form-group--error');
  group.classList.remove('form-group--success');

  // Create error message element
  const errorEl = document.createElement('p');
  errorEl.id = `${inputId}-error`;
  errorEl.className = 'error-message';
  setErrorText(errorEl, message);

  // Insert error before input
  input.parentNode.insertBefore(errorEl, input);

  // Update aria-describedby
  const hintId = `${inputId}-hint`;
  input.setAttribute('aria-describedby', `${hintId} ${errorEl.id}`);
  input.setAttribute('aria-invalid', 'true');

  // Focus the input
  input.focus();
}

/**
 * Show success message on a form group
 */
function showFieldSuccess(groupId, inputId, message) {
  const group = document.getElementById(groupId);
  const input = document.getElementById(inputId);

  // Remove any existing error/success
  clearFieldError(groupId, inputId);

  // Add success class
  group.classList.add('form-group--success');

  // Create success message element
  const successEl = document.createElement('p');
  successEl.id = `${inputId}-success`;
  successEl.className = 'success-message';
  successEl.textContent = message;

  // Insert after input (or input wrapper)
  const wrapper = input.closest('.input-prefix-wrapper') || input;
  wrapper.parentNode.insertBefore(successEl, wrapper.nextSibling);
}

/**
 * Clear error/success state from a form group
 */
function clearFieldError(groupId, inputId) {
  const group = document.getElementById(groupId);
  const input = document.getElementById(inputId);

  group.classList.remove('form-group--error', 'form-group--success');

  // Remove error message if exists
  const errorEl = document.getElementById(`${inputId}-error`);
  if (errorEl) errorEl.remove();

  // Remove success message if exists
  const successEl = document.getElementById(`${inputId}-success`);
  if (successEl) successEl.remove();

  // Reset aria attributes
  const hintId = `${inputId}-hint`;
  const hintEl = document.getElementById(hintId);
  if (hintEl) {
    input.setAttribute('aria-describedby', hintId);
  }
  input.removeAttribute('aria-invalid');
}

// ============================================
// VAT registration number Validation
// ============================================

/**
 * Validate VAT registration number
 * Format: 9 digits, optionally prefixed with "GB"
 */
function validateVATNumber(value) {
  let normalised = normalise(value);

  // Remove GB prefix if present
  if (normalised.startsWith('GB')) {
    normalised = normalised.substring(2);
  }

  // Must be exactly 9 digits
  if (!/^\d{9}$/.test(normalised)) {
    return {
      valid: false,
      error: 'Enter your VAT registration number in the correct format',
      normalised: null
    };
  }

  return {
    valid: true,
    error: null,
    normalised: normalised
  };
}

function validateVAT(event) {
  event.preventDefault();

  const input = document.getElementById('vat-registration-number');
  const value = input.value.trim();

  if (!value) {
    showFieldError('vat-form-group', 'vat-registration-number',
                   'Enter your VAT registration number');
    return false;
  }

  const result = validateVATNumber(value);

  if (!result.valid) {
    showFieldError('vat-form-group', 'vat-registration-number', result.error);
    return false;
  }

  showFieldSuccess('vat-form-group', 'vat-registration-number',
                   `✓ Valid VAT registration number: ${result.normalised}`);
  return false;
}

// ============================================
// UTR Validation
// ============================================

/**
 * Validate Unique Taxpayer Reference
 * Format: 10 or 13 digits, may end with letter K
 */
function validateUTRNumber(value) {
  let normalised = normalise(value);

  // Remove trailing K if present
  const endsWithK = normalised.endsWith('K');
  if (endsWithK) {
    normalised = normalised.slice(0, -1);
  }

  // Must be 10 or 13 digits (or 9/12 if K was removed)
  if (!/^\d{10}$/.test(normalised) && !/^\d{13}$/.test(normalised)) {
    return {
      valid: false,
      error: 'Enter your Unique Taxpayer Reference in the correct format',
      normalised: null
    };
  }

  return {
    valid: true,
    error: null,
    normalised: endsWithK ? normalised + 'K' : normalised
  };
}

function validateUTR(event) {
  event.preventDefault();

  const input = document.getElementById('utr');
  const value = input.value.trim();

  if (!value) {
    showFieldError('utr-form-group', 'utr',
                   'Enter your Self Assessment Unique Taxpayer Reference');
    return false;
  }

  const result = validateUTRNumber(value);

  if (!result.valid) {
    showFieldError('utr-form-group', 'utr', result.error);
    return false;
  }

  showFieldSuccess('utr-form-group', 'utr',
                   `✓ Valid UTR: ${result.normalised}`);
  return false;
}

// ============================================
// National Insurance Number Validation
// ============================================

/**
 * Validate National Insurance number
 * Format: 2 letters + 6 digits + 1 letter (A, B, C, or D)
 * Example: QQ123456C
 */
function validateNINONumber(value) {
  const normalised = normalise(value);

  // Pattern: 2 letters, 6 digits, 1 letter (A, B, C, or D)
  const pattern = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[ABCD]$/;

  if (!pattern.test(normalised)) {
    return {
      valid: false,
      error: 'Enter a National Insurance number in the correct format',
      normalised: null
    };
  }

  // Format with spaces for display: XX 00 00 00 X
  const formatted = `${normalised.slice(0,2)} ${normalised.slice(2,4)} ${normalised.slice(4,6)} ${normalised.slice(6,8)} ${normalised.slice(8)}`;

  return {
    valid: true,
    error: null,
    normalised: normalised,
    formatted: formatted
  };
}

function validateNINO(event) {
  event.preventDefault();

  const input = document.getElementById('national-insurance-number');
  const value = input.value.trim();

  if (!value) {
    showFieldError('nino-form-group', 'national-insurance-number',
                   'Enter your National Insurance number');
    return false;
  }

  const result = validateNINONumber(value);

  if (!result.valid) {
    showFieldError('nino-form-group', 'national-insurance-number', result.error);
    return false;
  }

  showFieldSuccess('nino-form-group', 'national-insurance-number',
                   `✓ Valid National Insurance number: ${result.formatted}`);
  return false;
}

// ============================================
// Employer PAYE Reference Validation
// ============================================

/**
 * Validate Employer PAYE reference
 * Format: 3 digits + "/" + employer reference
 * Example: 123/AB456
 */
function validatePAYEReference(value) {
  const normalised = normalise(value);

  // Pattern: 3 digits, forward slash, alphanumeric reference
  const pattern = /^\d{3}\/[A-Z0-9]+$/;

  if (!pattern.test(normalised)) {
    return {
      valid: false,
      error: 'Enter your employer PAYE reference in the correct format',
      normalised: null
    };
  }

  return {
    valid: true,
    error: null,
    normalised: normalised
  };
}

function validatePAYE(event) {
  event.preventDefault();

  const input = document.getElementById('employer-paye-reference');
  const value = input.value.trim();

  if (!value) {
    showFieldError('paye-form-group', 'employer-paye-reference',
                   'Enter your employer PAYE reference');
    return false;
  }

  const result = validatePAYEReference(value);

  if (!result.valid) {
    showFieldError('paye-form-group', 'employer-paye-reference', result.error);
    return false;
  }

  showFieldSuccess('paye-form-group', 'employer-paye-reference',
                   `✓ Valid PAYE reference: ${result.normalised}`);
  return false;
}

// ============================================
// Accounts Office Reference Validation
// ============================================

/**
 * Validate Accounts Office reference
 * Format: 13 alphanumeric characters
 * Example: 123PX00123456
 */
function validateAccountsReference(value) {
  const normalised = normalise(value);

  // Must be exactly 13 alphanumeric characters
  if (!/^[A-Z0-9]{13}$/.test(normalised)) {
    return {
      valid: false,
      error: 'Enter your Accounts Office reference in the correct format',
      normalised: null
    };
  }

  return {
    valid: true,
    error: null,
    normalised: normalised
  };
}

function validateAccountsRef(event) {
  event.preventDefault();

  const input = document.getElementById('accounts-office-reference');
  const value = input.value.trim();

  if (!value) {
    showFieldError('accounts-form-group', 'accounts-office-reference',
                   'Enter your Accounts Office reference');
    return false;
  }

  const result = validateAccountsReference(value);

  if (!result.valid) {
    showFieldError('accounts-form-group', 'accounts-office-reference', result.error);
    return false;
  }

  showFieldSuccess('accounts-form-group', 'accounts-office-reference',
                   `✓ Valid Accounts Office reference: ${result.normalised}`);
  return false;
}

// ============================================
// EORI Number Validation
// ============================================

/**
 * Validate EORI number
 * Format: GB or XI + 12 or 15 digits
 * Example: GB123456123456
 */
function validateEORINumber(value) {
  const normalised = normalise(value);

  // Pattern: GB or XI followed by 12 or 15 digits
  // eslint-disable-next-line security/detect-unsafe-regex -- Linear time O(n), no backtracking: anchored start/end with fixed alternation and digit quantifiers
  const pattern = /^(GB|XI)\d{12}(\d{3})?$/;

  if (!pattern.test(normalised)) {
    return {
      valid: false,
      error: 'Enter your EORI number in the correct format',
      normalised: null
    };
  }

  return {
    valid: true,
    error: null,
    normalised: normalised
  };
}

function validateEORI(event) {
  event.preventDefault();

  const input = document.getElementById('eori-number');
  const value = input.value.trim();

  if (!value) {
    showFieldError('eori-form-group', 'eori-number',
                   'Enter your EORI number');
    return false;
  }

  const result = validateEORINumber(value);

  if (!result.valid) {
    showFieldError('eori-form-group', 'eori-number', result.error);
    return false;
  }

  showFieldSuccess('eori-form-group', 'eori-number',
                   `✓ Valid EORI number: ${result.normalised}`);
  return false;
}

// ============================================
// Currency Validation
// ============================================

/**
 * Validate currency input
 * Format: Pounds with optional pence (up to 2 decimal places)
 */
function validateCurrencyValue(value) {
  // Remove £ symbol, commas, and spaces
  let normalised = value.replace(/[£,\s]/g, '');

  // Must be a valid decimal number with up to 2 decimal places
  // eslint-disable-next-line security/detect-unsafe-regex -- Linear time O(n), no backtracking: anchored with simple digit/decimal pattern
  const pattern = /^\d+(\.\d{1,2})?$/;

  if (!pattern.test(normalised)) {
    return {
      valid: false,
      error: 'Enter an amount in pounds and pence, like £600 or £193.54',
      normalised: null
    };
  }

  const amount = parseFloat(normalised);

  return {
    valid: true,
    error: null,
    normalised: amount.toFixed(2),
    formatted: `£${amount.toFixed(2)}`
  };
}

function validateCurrency(event) {
  event.preventDefault();

  const input = document.getElementById('amount');
  const value = input.value.trim();

  if (!value) {
    showFieldError('currency-form-group', 'amount',
                   'Enter an amount');
    return false;
  }

  const result = validateCurrencyValue(value);

  if (!result.valid) {
    showFieldError('currency-form-group', 'amount', result.error);
    return false;
  }

  showFieldSuccess('currency-form-group', 'amount',
                   `✓ Valid amount: ${result.formatted}`);
  return false;
}

// ============================================
// Date Validation
// ============================================

/**
 * Validate date input (day, month, year)
 */
function validateDateValue(day, month, year) {
  const errors = [];

  // Check for empty fields
  if (!day) errors.push('day');
  if (!month) errors.push('month');
  if (!year) errors.push('year');

  if (errors.length > 0) {
    return {
      valid: false,
      error: `Date of birth must include a ${errors.join(', ')}`,
      date: null
    };
  }

  // Parse values
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  // Basic validation
  if (isNaN(d) || d < 1 || d > 31) {
    return { valid: false, error: 'Enter a valid day', date: null };
  }
  if (isNaN(m) || m < 1 || m > 12) {
    return { valid: false, error: 'Enter a valid month', date: null };
  }
  if (isNaN(y) || y < 1900 || y > new Date().getFullYear()) {
    return { valid: false, error: 'Enter a valid year', date: null };
  }

  // Check if date is valid
  const date = new Date(y, m - 1, d);
  if (date.getDate() !== d || date.getMonth() !== m - 1 || date.getFullYear() !== y) {
    return { valid: false, error: 'Enter a real date', date: null };
  }

  return {
    valid: true,
    error: null,
    date: date,
    formatted: `${d} ${['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'][m-1]} ${y}`
  };
}

function validateDate(event) {
  event.preventDefault();

  const day = document.getElementById('dob-day').value.trim();
  const month = document.getElementById('dob-month').value.trim();
  const year = document.getElementById('dob-year').value.trim();

  const result = validateDateValue(day, month, year);

  if (!result.valid) {
    // For date fields, we show error on the fieldset
    const fieldset = document.getElementById('date-form-group');
    fieldset.classList.add('form-group--error');

    // Create or update error message
    let errorEl = document.getElementById('dob-error');
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.id = 'dob-error';
      errorEl.className = 'error-message';
      const hint = document.getElementById('dob-hint');
      hint.parentNode.insertBefore(errorEl, hint.nextSibling);
    }
    setErrorText(errorEl, result.error);

    document.getElementById('dob-day').focus();
    return false;
  }

  // Clear error state
  const fieldset = document.getElementById('date-form-group');
  fieldset.classList.remove('form-group--error');
  fieldset.classList.add('form-group--success');

  const errorEl = document.getElementById('dob-error');
  if (errorEl) errorEl.remove();

  // Show success
  let successEl = document.getElementById('dob-success');
  if (!successEl) {
    successEl = document.createElement('p');
    successEl.id = 'dob-success';
    successEl.className = 'success-message';
    const dateInput = document.querySelector('.date-input');
    dateInput.parentNode.insertBefore(successEl, dateInput.nextSibling);
  }
  successEl.textContent = `✓ Valid date: ${result.formatted}`;

  return false;
}

// ============================================
// Demo: Show Error State
// ============================================

/**
 * Demonstrate error state for a field
 */
function showError(fieldType) {
  switch (fieldType) {
    case 'vat':
      showFieldError('vat-form-group', 'vat-registration-number',
                     'Enter your VAT registration number');
      break;
    case 'utr':
      showFieldError('utr-form-group', 'utr',
                     'Enter your Self Assessment Unique Taxpayer Reference');
      break;
    case 'nino':
      showFieldError('nino-form-group', 'national-insurance-number',
                     'Enter a National Insurance number that is 2 letters, 6 numbers, then A, B, C or D, like QQ 12 34 56 C');
      break;
  }
}

// ============================================
// Exports for use in other modules
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateVATNumber,
    validateUTRNumber,
    validateNINONumber,
    validatePAYEReference,
    validateAccountsReference,
    validateEORINumber,
    validateCurrencyValue,
    validateDateValue
  };
}

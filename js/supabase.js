// Supabase client access. Shared constants, error helpers, DOM helpers and URL
// helpers now live in js/core.js, which must load before this file.

let pamanaSupabase = null;

function hasSupabaseConfig() {
  return Boolean(
    PAMANA_CONFIG.supabaseUrl
    && PAMANA_CONFIG.supabasePublishableKey
  );
}

function getSupabaseClient() {
  if (!hasSupabaseConfig()) {
    console.warn(APP_MESSAGES.notConfigured);
    return null;
  }

  if (!window.supabase) {
    console.error('Supabase JavaScript CDN did not load.');
    return null;
  }

  if (!pamanaSupabase) {
    pamanaSupabase = window.supabase.createClient(
      PAMANA_CONFIG.supabaseUrl,
      PAMANA_CONFIG.supabasePublishableKey
    );
  }

  return pamanaSupabase;
}

// Runs a read/write that returns Supabase's own { data, error } result.
// Missing configuration and thrown request errors become friendly results.
// A Supabase result error is passed through untouched, as before.
async function runSupabaseQuery(contextMessage, fallbackMessage, buildQuery) {
  const supabaseClient = getSupabaseClient();

  if (!supabaseClient) {
    return createErrorResult(APP_MESSAGES.notConfigured);
  }

  try {
    return await buildQuery(supabaseClient);
  } catch (error) {
    logAppError(contextMessage, error);
    return createErrorResult(getAppErrorMessage(error, fallbackMessage));
  }
}

if (hasSupabaseConfig()) {
  getSupabaseClient();
} else {
  console.warn(APP_MESSAGES.notConfigured);
}

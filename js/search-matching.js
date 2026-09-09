// Pure search helpers: no DOM, no Supabase, no page state.
//
// These decide how a typed term is compared against heritage site fields that
// were already returned by the database. They never decide visibility. Which
// rows exist at all is settled by the status filters in js/queries.js and by
// Row Level Security, so nothing here can surface an archived site or an
// unpublished story.
//
// Because they are pure, they can be exercised directly. See the checks in
// the project notes for the cases covered.

const SEARCHABLE_SITE_FIELDS = ['name', 'location', 'historical_period'];

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().trim();
}

// The single string a site is matched against, built from its public fields.
function buildSiteSearchText(site) {
  return SEARCHABLE_SITE_FIELDS
    .map(function (field) {
      return normalizeSearchText(site[field]);
    })
    .join(' ');
}

// An empty term matches everything, which is how browse shows the full list.
function siteMatchesSearch(site, normalizedTerm) {
  if (!normalizedTerm) {
    return true;
  }

  return buildSiteSearchText(site).includes(normalizedTerm);
}

function filterSitesBySearch(sites, normalizedTerm) {
  return sites.filter(function (site) {
    return siteMatchesSearch(site, normalizedTerm);
  });
}

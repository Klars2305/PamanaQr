// Supabase data access, grouped by domain.
//
// Every function here builds one query, runs it through runSupabaseQuery, and
// returns Supabase's own { data, error } result. Nothing in this file touches
// the DOM, and nothing here decides who may see a row: Row Level Security in
// database/schema.sql is the real security layer. These queries only ask.

function countTableRows(tableName, column, value, contextMessage) {
  return runSupabaseQuery(contextMessage, APP_MESSAGES.databaseFailed, function (supabaseClient) {
    return supabaseClient
      .from(tableName)
      .select('id', {
        count: 'exact',
        head: true
      })
      .eq(column, value);
  });
}

/* ---------------------------------------------------------------------------
 * Heritage sites
 * ------------------------------------------------------------------------ */

const HeritageQueries = {
  // Public browse and home pages. RLS also restricts visitors to active rows.
  listActive: function () {
    return runSupabaseQuery('Could not load public heritage sites.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .select('id, slug, name, short_description, location, historical_period, main_photo')
        .eq('status', SITE_STATUSES.active)
        .order('name', { ascending: true });
    });
  },

  // Contributor story form: the heritage site picker.
  listActiveForPicker: function () {
    return runSupabaseQuery('Could not load heritage sites for submission.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .select('id, name, location')
        .eq('status', SITE_STATUSES.active)
        .order('name', { ascending: true });
    });
  },

  // Administrator table: active and archived together, per the admin RLS policy.
  listAll: function () {
    return runSupabaseQuery('Could not load heritage sites.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .select('id, slug, name, location, historical_period, status')
        .order('name', { ascending: true });
    });
  },

  getActiveBySlug: function (slug) {
    return runSupabaseQuery('Could not load active heritage site.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .select('id, slug, name, short_description, historical_background, location, historical_period, source_reference, main_photo')
        .eq('slug', slug)
        .eq('status', SITE_STATUSES.active)
        .maybeSingle();
    });
  },

  getForEditing: function (siteId) {
    return runSupabaseQuery('Could not load heritage site for editing.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .select('id, name, location, historical_period, short_description, historical_background, source_reference, status, main_photo')
        .eq('id', siteId)
        .single();
    });
  },

  // Slug uniqueness check. excludeSiteId keeps a site from matching itself.
  findBySlug: function (slug, excludeSiteId) {
    return runSupabaseQuery('Could not check heritage slug uniqueness.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      let query = supabaseClient
        .from('heritage_sites')
        .select('id')
        .eq('slug', slug);

      if (excludeSiteId) {
        query = query.neq('id', excludeSiteId);
      }

      return query.maybeSingle();
    });
  },

  insert: function (record) {
    return runSupabaseQuery('Could not create heritage site.', APP_MESSAGES.saveFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .insert(record)
        .select('id, slug')
        .single();
    });
  },

  update: function (siteId, updates) {
    return runSupabaseQuery('Could not update heritage site.', APP_MESSAGES.saveFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .update(updates)
        .eq('id', siteId)
        .select('id, slug')
        .single();
    });
  },

  updateMainPhoto: function (siteId, imagePath) {
    return runSupabaseQuery('Could not save heritage image path.', APP_MESSAGES.saveFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .update({
          main_photo: imagePath
        })
        .eq('id', siteId);
    });
  },

  setStatus: function (siteId, status) {
    return runSupabaseQuery('Could not update heritage status.', APP_MESSAGES.saveFailed, function (supabaseClient) {
      return supabaseClient
        .from('heritage_sites')
        .update({
          status: status
        })
        .eq('id', siteId);
    });
  },

  countByStatus: function (status) {
    return countTableRows('heritage_sites', 'status', status, 'Could not count heritage sites.');
  }
};

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------ */

const StoryQueries = {
  listByContributor: function (contributorId) {
    return runSupabaseQuery('Could not load contributor submissions.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .select('id, title, status, classification, created_at, heritage_sites(name), media(id, image_url, caption)')
        .eq('contributor_id', contributorId)
        .order('created_at', { ascending: false });
    });
  },

  // Contributor dashboard counts the statuses in the browser.
  listStatusesByContributor: function (contributorId) {
    return runSupabaseQuery('Could not load contributor dashboard.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .select('status')
        .eq('contributor_id', contributorId);
    });
  },

  listByStatus: function (status) {
    return runSupabaseQuery('Could not load administrator story records.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .select('id, title, contributor_display_name, suggested_classification, classification, status, created_at, reviewed_at, heritage_sites(name)')
        .eq('status', status)
        .order('created_at', { ascending: status === STORY_STATUSES.submitted });
    });
  },

  listPublishedForSite: function (heritageSiteId) {
    return runSupabaseQuery('Could not load published stories.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .select('id, title, content, classification, contributor_display_name, allow_public_name, published_at')
        .eq('heritage_site_id', heritageSiteId)
        .eq('status', STORY_STATUSES.published)
        .order('published_at', { ascending: false });
    });
  },

  searchPublishedByTitle: function (searchTerm) {
    return runSupabaseQuery('Could not search published story titles.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .select('id, title, classification, heritage_sites(name, slug)')
        .eq('status', STORY_STATUSES.published)
        .ilike('title', `%${searchTerm}%`);
    });
  },

  getPublished: function (storyId) {
    return runSupabaseQuery('Could not load published story.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .select('id, title, content, source_reference, classification, contributor_display_name, allow_public_name, heritage_sites(name, slug), media(id, image_url, caption)')
        .eq('id', storyId)
        .eq('status', STORY_STATUSES.published)
        .maybeSingle();
    });
  },

  getForReview: function (storyId) {
    return runSupabaseQuery('Could not load story for review.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .select('id, title, content, source_reference, suggested_classification, classification, status, contributor_display_name, created_at, review_notes, reviewed_at, reviewed_by, published_at, heritage_sites(name, location, historical_period, short_description), media(id, image_url, caption)')
        .eq('id', storyId)
        .maybeSingle();
    });
  },

  insert: function (record) {
    return runSupabaseQuery('Could not submit story.', APP_MESSAGES.unauthorizedSubmission, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .insert(record)
        .select('id, status')
        .single();
    });
  },

  // The submitted-status filter is what stops a second review from landing on a
  // story another administrator already decided.
  applyReview: function (storyId, updates) {
    return runSupabaseQuery('Could not update story review status.', APP_MESSAGES.unauthorizedAdminAction, function (supabaseClient) {
      return supabaseClient
        .from('stories')
        .update(updates)
        .eq('id', storyId)
        .eq('status', STORY_STATUSES.submitted)
        .select('id, status')
        .maybeSingle();
    });
  },

  countByStatus: function (status) {
    return countTableRows('stories', 'status', status, 'Could not count stories.');
  }
};

/* ---------------------------------------------------------------------------
 * Profiles
 * ------------------------------------------------------------------------ */

const ProfileQueries = {
  getById: function (userId) {
    return runSupabaseQuery('Could not load user profile.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('profiles')
        .select('id, display_name, role')
        .eq('id', userId)
        .single();
    });
  },

  countByRole: function (role) {
    return countTableRows('profiles', 'role', role, 'Could not count profiles.');
  }
};

/* ---------------------------------------------------------------------------
 * Media
 * ------------------------------------------------------------------------ */

const MediaQueries = {
  // Related photos attached to a heritage site, never to a story.
  listForHeritageSite: function (heritageSiteId) {
    return runSupabaseQuery('Could not load related heritage photos.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      return supabaseClient
        .from('media')
        .select('id, image_url, caption, created_at')
        .eq('heritage_site_id', heritageSiteId)
        .is('story_id', null)
        .order('created_at', { ascending: false });
    });
  },

  // Public heritage page: site photos plus photos on its published stories.
  listForSiteAndStories: function (heritageSiteId, publishedStoryIds) {
    return runSupabaseQuery('Could not load related media.', APP_MESSAGES.databaseFailed, function (supabaseClient) {
      const query = supabaseClient
        .from('media')
        .select('id, image_url, caption, story_id, heritage_site_id, created_at');

      const scoped = publishedStoryIds.length
        ? query.or(`heritage_site_id.eq.${heritageSiteId},story_id.in.(${publishedStoryIds.join(',')})`)
        : query.eq('heritage_site_id', heritageSiteId);

      return scoped.order('created_at', { ascending: false });
    });
  },

  insert: function (record) {
    return runSupabaseQuery('Could not save media record.', APP_MESSAGES.saveFailed, function (supabaseClient) {
      return supabaseClient
        .from('media')
        .insert(record);
    });
  },

  deleteHeritagePhoto: function (mediaId, heritageSiteId) {
    return runSupabaseQuery('Could not remove related heritage photo record.', APP_MESSAGES.saveFailed, function (supabaseClient) {
      return supabaseClient
        .from('media')
        .delete()
        .eq('id', mediaId)
        .eq('heritage_site_id', heritageSiteId)
        .is('story_id', null);
    });
  }
};

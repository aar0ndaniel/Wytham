const SIGNUP_EMAIL_COLUMNS = 'token,email_status,email_error,email_sent_at';
const RECENT_SIGNUP_COLUMNS =
  'token,name,email,institution,country,role,edition,created_at,updated_at,email_status,beta_visits,last_beta_visit_at';
const EMAIL_SIGNUP_COLUMNS = RECENT_SIGNUP_COLUMNS;
const RECENT_DONATION_COLUMNS = 'name,email,country,amount,message,created_at';
const RECENT_FEEDBACK_COLUMNS =
  'id,name,email,windows_version,ram,app_version,dataset_type,sample_size,num_constructs,num_indicators,features_tested,draw_mode,navigation,analysis,tam,overall,screenshot_url,privacy_policy_version,privacy_accepted_at,source_page,source_title,created_at';
const DONATION_SUMMARY_COLUMNS = 'email,country,amount';
const FEEDBACK_SUMMARY_COLUMNS = 'email,created_at';
const EXPORT_DONATION_COLUMNS = RECENT_DONATION_COLUMNS;
const EXPORT_FEEDBACK_COLUMNS = RECENT_FEEDBACK_COLUMNS;
const EXPORT_SIGNUP_COLUMNS = 'name,email,institution,country,role,edition,created_at,email_status,beta_visits';
const SIGNUP_SERIES_COLUMNS = 'created_at,edition';
const SIGNUP_SUMMARY_COLUMNS = 'edition,beta_visits';
const COMMENT_PUBLIC_COLUMNS = 'id,name,body,created_at';

function createStore(client, options = {}) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('createStore requires a Supabase-style client with a from() method.');
  }

  const tables = {
    donations: options.donationsTable || 'donations',
    feedback: options.feedbackTable || 'feedback',
    signups: options.signupsTable || 'signups',
    comments: options.commentsTable || 'comments',
  };

  return {
    deleteSignupByToken(token) {
      return client.from(tables.signups).delete().eq('token', token).select('token').single();
    },

    findSignupByEmail(email) {
      return client.from(tables.signups).select('*').eq('email', email).maybeSingle();
    },

    findSignupByToken(token) {
      return client.from(tables.signups).select('*').eq('token', token).maybeSingle();
    },

    insertDonation(donation) {
      return client.from(tables.donations).insert(donation).select('*').single();
    },

    insertFeedback(feedback) {
      return client.from(tables.feedback).insert(feedback).select('*').single();
    },

    insertSignup(signup) {
      return client.from(tables.signups).insert(normalizeSignupWrite(signup)).select('*').single();
    },

    listRecentDonations(limit = 50) {
      return client.from(tables.donations).select(RECENT_DONATION_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listRecentFeedback(limit = 100) {
      return client
        .from(tables.feedback)
        .select(RECENT_FEEDBACK_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);
    },

    listRecentSignups(limit = 50) {
      return client.from(tables.signups).select(RECENT_SIGNUP_COLUMNS).order('updated_at', { ascending: false }).limit(limit);
    },

    listSignupsForEmail(limit = 5000) {
      return client.from(tables.signups).select(EMAIL_SIGNUP_COLUMNS).order('updated_at', { ascending: false }).limit(limit);
    },

    listSignupsForExport(limit = 1000) {
      return client.from(tables.signups).select(EXPORT_SIGNUP_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listDonationsForExport(limit = 1000) {
      return client.from(tables.donations).select(EXPORT_DONATION_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listFeedbackForExport(limit = 5000) {
      return client.from(tables.feedback).select(EXPORT_FEEDBACK_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listInstitutionRows(limit = 1000) {
      return client.from(tables.signups).select('institution').order('created_at', { ascending: false }).limit(limit);
    },

    listDonationSummaryRows(limit = 5000) {
      return client.from(tables.donations).select(DONATION_SUMMARY_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listFeedbackSummaryRows(limit = 5000) {
      return client.from(tables.feedback).select(FEEDBACK_SUMMARY_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    markSignupEmailStatus(token, { error = '', sentAt = '', status } = {}) {
      return client
        .from(tables.signups)
        .update({
          email_error: error,
          email_sent_at: normalizeTimestamp(sentAt),
          email_status: normalizeEmailStatus(status),
        })
        .eq('token', token)
        .select(SIGNUP_EMAIL_COLUMNS)
        .single();
    },

    markSignupVisit(token, { betaVisits, visitedAt } = {}) {
      const patch = {};
      if (betaVisits != null) {
        patch.beta_visits = betaVisits;
      }
      if (visitedAt != null) {
        patch.last_beta_visit_at = normalizeTimestamp(visitedAt);
      }

      return client
        .from(tables.signups)
        .update(patch)
        .eq('token', token)
        .select('token,beta_visits,last_beta_visit_at')
        .single();
    },

    summarizeInstitutionRows,
    summarizeDonations,
    summarizeDailySignupRows,
    summarizeSignups,

    listSignupSeriesRows(limit = 5000) {
      return client.from(tables.signups).select(SIGNUP_SERIES_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listSignupSummaryRows(limit = 5000) {
      return client.from(tables.signups).select(SIGNUP_SUMMARY_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    updateSignupByEmail(email, updates) {
      return client.from(tables.signups).update(normalizeSignupWrite(updates)).eq('email', email).select('*').single();
    },

    insertComment(comment) {
      const row = {
        name: comment.name,
        body: comment.body,
        created_at: comment.created_at,
      };
      return client.from(tables.comments).insert(row).select(COMMENT_PUBLIC_COLUMNS).single();
    },

    listRecentComments(limit = 200) {
      return client
        .from(tables.comments)
        .select(COMMENT_PUBLIC_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);
    },
  };
}

function normalizeEmailStatus(status) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  return normalized === 'sent' || normalized === 'failed' ? normalized : 'pending';
}

function normalizeTimestamp(value) {
  return String(value || '').trim() ? value : null;
}

function normalizeSignupWrite(value) {
  const row = { ...(value || {}) };
  if ('last_beta_visit_at' in row) {
    row.last_beta_visit_at = normalizeTimestamp(row.last_beta_visit_at);
  }
  if ('email_sent_at' in row) {
    row.email_sent_at = normalizeTimestamp(row.email_sent_at);
  }
  return row;
}

function summarizeSignups(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.edition === 'lite') {
        summary.lite_count += 1;
      } else if (row.edition === 'bundle') {
        summary.bundle_count += 1;
      }

      const visits = Number(row.beta_visits) || 0;
      if (visits > 0) {
        summary.opened_count += 1;
      }
      summary.total_beta_visits += visits;
      return summary;
    },
    {
      total: 0,
      lite_count: 0,
      bundle_count: 0,
      opened_count: 0,
      total_beta_visits: 0,
    }
  );
}

function summarizeDonations(rows) {
  const emails = new Set();
  const countries = new Set();

  const summary = {
    total: 0,
    unique_donors: 0,
    countries: 0,
    amount_entries: 0,
  };

  for (const row of rows) {
    summary.total += 1;

    const email = String(row.email || '').trim().toLowerCase();
    if (email) {
      emails.add(email);
    }

    const country = String(row.country || '').trim();
    if (country) {
      countries.add(country);
    }

    if (String(row.amount || '').trim()) {
      summary.amount_entries += 1;
    }
  }

  summary.unique_donors = emails.size;
  summary.countries = countries.size;
  return summary;
}

function summarizeInstitutionRows(rows, limit = 10) {
  const counts = new Map();

  for (const row of rows) {
    const institution = String(row.institution || '').trim();
    if (!institution) {
      continue;
    }

    counts.set(institution, (counts.get(institution) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([institution, total]) => ({ institution, total }))
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }

      return left.institution.localeCompare(right.institution);
    })
    .slice(0, limit);
}

function summarizeDailySignupRows(rows, days = 14, referenceDate = new Date()) {
  const lookup = new Map();

  for (const row of rows || []) {
    const createdAt = String(row.created_at || '');
    const day = createdAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      continue;
    }

    const entry = lookup.get(day) || { day, total: 0, lite_count: 0, bundle_count: 0 };
    entry.total += 1;

    if (row.edition === 'lite') {
      entry.lite_count += 1;
    } else if (row.edition === 'bundle') {
      entry.bundle_count += 1;
    }

    lookup.set(day, entry);
  }

  const today = new Date(referenceDate);
  today.setUTCHours(0, 0, 0, 0);

  const result = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(today);
    current.setUTCDate(today.getUTCDate() - offset);
    const day = current.toISOString().slice(0, 10);
    const entry = lookup.get(day) || { total: 0, lite_count: 0, bundle_count: 0 };
    result.push({
      day,
      total: entry.total,
      lite_count: entry.lite_count,
      bundle_count: entry.bundle_count,
    });
  }

  return result;
}

module.exports = {
  createStore,
  normalizeEmailStatus,
  normalizeTimestamp,
  summarizeDailySignupRows,
  summarizeDonations,
  summarizeInstitutionRows,
  summarizeSignups,
};

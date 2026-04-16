const SIGNUP_EMAIL_COLUMNS = 'token,email_status,email_error,email_sent_at';
const RECENT_SIGNUP_COLUMNS =
  'token,name,email,institution,country,role,edition,created_at,email_status,beta_visits,last_beta_visit_at';
const RECENT_DONATION_COLUMNS = 'name,email,country,amount,message,created_at';
const EXPORT_SIGNUP_COLUMNS = 'name,email,institution,country,role,edition,created_at,email_status,beta_visits';

function createStore(client, options = {}) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('createStore requires a Supabase-style client with a from() method.');
  }

  const tables = {
    donations: options.donationsTable || 'donations',
    signups: options.signupsTable || 'signups',
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

    insertSignup(signup) {
      return client.from(tables.signups).insert(signup).select('*').single();
    },

    listRecentDonations(limit = 50) {
      return client.from(tables.donations).select(RECENT_DONATION_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listRecentSignups(limit = 50) {
      return client.from(tables.signups).select(RECENT_SIGNUP_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listSignupsForExport(limit = 1000) {
      return client.from(tables.signups).select(EXPORT_SIGNUP_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    },

    listInstitutionRows(limit = 1000) {
      return client.from(tables.signups).select('institution').order('created_at', { ascending: false }).limit(limit);
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
    summarizeSignups,

    updateSignupByEmail(email, updates) {
      return client.from(tables.signups).update(updates).eq('email', email).select('*').single();
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

module.exports = {
  createStore,
  normalizeEmailStatus,
  normalizeTimestamp,
  summarizeDonations,
  summarizeInstitutionRows,
  summarizeSignups,
};

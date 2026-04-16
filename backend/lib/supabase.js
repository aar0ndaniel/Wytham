function createAdminSupabaseClient(config, dependencies = {}) {
  const supabase = config && config.supabase ? config.supabase : {};
  if (!supabase.url || !supabase.secretKey) {
    throw new Error('Missing Supabase admin configuration. Expected padi and Tarkitey.');
  }

  const createClient = dependencies.createClient || loadCreateClient();
  return createClient(supabase.url, supabase.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    db: {
      schema: supabase.schema || 'public',
    },
  });
}

function loadCreateClient() {
  return require('@supabase/supabase-js').createClient;
}

module.exports = {
  createAdminSupabaseClient,
};

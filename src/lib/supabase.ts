import { createClient } from '@supabase/supabase-js';

// Domínio customizado Supabase - não expõe o project ref na URL
const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'];
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias. ' +
    'Configure no arquivo .env seguindo o .env.example'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Extension manages session manually via chrome.storage
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

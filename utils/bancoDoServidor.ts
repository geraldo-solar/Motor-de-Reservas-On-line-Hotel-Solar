import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Conexão das rotas do servidor (api/*) com o banco.
//
// Usa a chave do servidor (SUPABASE_SERVICE_ROLE_KEY, cadastrada só na Vercel,
// nunca no navegador). Enquanto ela não estiver cadastrada, cai na chave
// pública, como as rotas faziam até aqui — isso deixa de funcionar quando a
// chave pública for fechada (VEN-10, fase 3), por isso `chaveDoBanco()` diz
// qual das duas está em uso, sem mostrar o valor.

export function chaveDoBanco(): 'servidor' | 'publica' | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) return 'servidor';
  if (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY) return 'publica';
  return null;
}

let conexao: SupabaseClient | null = null;

export function bancoDoServidor(): SupabaseClient {
  if (conexao) return conexao;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
    || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !chave) throw new Error('Banco não configurado no servidor.');
  conexao = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  return conexao;
}

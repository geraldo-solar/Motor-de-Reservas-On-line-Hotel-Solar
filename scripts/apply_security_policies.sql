-- ==============================================================================
-- SCRIPT DE SEGURANÇA (RLS) - HOTEL SOLAR
-- ==============================================================================
-- Este script ativa o Row Level Security (RLS) em todas as tabelas críticas e
-- define políticas de acesso baseadas na autenticação do Supabase.
--
-- INSTRUÇÕES:
-- 1. Copie todo o conteúdo deste arquivo.
-- 2. Vá no Painel do Supabase -> SQL Editor.
-- 3. Cole e clique em "Run".
-- ==============================================================================

-- 1. Tabela: ROOM_TYPES (Acomodações)
alter table room_types enable row level security;

-- Quem pode ver? Todos (Público)
create policy "Public Read Rooms"
on room_types for select
using (true);

-- Quem pode editar?
-- Idealmente apenas Admin, mas como o site atualiza o estoque diretamente no cliente,
-- precisamos permitir UPDATE para Anon por enquanto.
-- TODO: Futuramente, migrar lógica de estoque para Database Trigger ou Edge Function para fechar isso.
create policy "Public Update Rooms (Inventory)"
on room_types for update
using (true)
with check (true);

-- Admin tem poder total
create policy "Admin All Rooms"
on room_types for all
using (auth.role() = 'authenticated');


-- 2. Tabela: PACKAGES (Pacotes)
alter table packages enable row level security;

create policy "Public Read Packages"
on packages for select
using (true);

create policy "Admin All Packages"
on packages for all
using (auth.role() = 'authenticated');


-- 3. Tabela: EXTRAS (Serviços Adicionais)
alter table extras enable row level security;

create policy "Public Read Extras"
on extras for select
using (true);

create policy "Admin All Extras"
on extras for all
using (auth.role() = 'authenticated');


-- 4. Tabela: DISCOUNT_CODES (Cupons)
alter table discount_codes enable row level security;

create policy "Public Read Discounts"
on discount_codes for select
using (true);

create policy "Admin All Discounts"
on discount_codes for all
using (auth.role() = 'authenticated');


-- 5. Tabela: RESERVATIONS (Reservas)
-- Esta é a tabela mais crítica (Dados Pessoais).
alter table reservations enable row level security;

-- Público pode INSERIR (Criar reserva)
create policy "Public Create Reservation"
on reservations for insert
with check (true);

-- Público NÃO PODE ler reservas de outros (apenas Admin)
-- Nota: O site exibe a confirmação usando dados em memória, então não precisa de SELECT público.

-- Admin vê e edita tudo
create policy "Admin All Reservations"
on reservations for all
using (auth.role() = 'authenticated');


-- 6. Tabela: HOTEL_CONFIG (Se existir no banco)
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'hotel_config') then
    execute 'alter table hotel_config enable row level security';
    execute 'create policy "Public Read Config" on hotel_config for select using (true)';
    execute 'create policy "Admin All Config" on hotel_config for all using (auth.role() = ''authenticated'')';
  end if;
end
$$;

-- FINALIZAÇÃO
-- Se o usuário Admin ainda não existe, ele deve ser criado via Auth > Users no painel.

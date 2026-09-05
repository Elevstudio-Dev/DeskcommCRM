-- 0210 — os GRUPOS de WhatsApp ganham identidade própria no CRM.
--
-- ## O defeito que esta migration destrava
--
-- `lib/waha/ingest.ts` descartava toda mensagem de grupo ("grupos não fazem
-- binding CRM"). O descarte não era preguiça: era a única saída segura, porque
-- `contacts.wa_identity` é coluna GERADA e só sabe produzir duas formas —
--
--     phone:+5511...        (quando phone_number existe)
--     lid:123456            (quando source_metadata->>'waha_lid' existe)
--     NULL                  (qualquer outra coisa)
--
-- e o índice `uniq_contacts_org_wa_identity` é PARCIAL, `where wa_identity is
-- not null`. Grupo não tem telefone nem lid, então cairia no NULL, e linha NULL
-- nunca conflita com nada: cada webhook do mesmo grupo criaria UM CONTATO NOVO.
-- É o anti-pattern que a 0027 veio matar, e o comentário em `ingest.ts:423`
-- documenta exatamente este buraco.
--
-- ## Por que um índice novo, e não uma terceira perna em `wa_identity`
--
-- Acrescentar `when source_metadata->>'waha_group_id' is not null then
-- 'group:'||...` seria mais elegante, e foi a primeira ideia. Postgres não
-- permite ALTER de expressão de coluna gerada: exigiria DROP da coluna, e a
-- coluna carrega o índice único de que toda a deduplicação de contato depende —
-- num banco de cliente, com a tabela grande, isso é uma janela onde duas
-- mensagens simultâneas duplicam contato de PESSOA, não só de grupo. O ganho
-- estético não paga o risco.
--
-- Índice PARCIAL novo, sobre a expressão, faz o mesmo trabalho sem tocar em
-- nada que já funciona. `wa_identity` continua NULL para grupo — e continua
-- correto que continue: grupo não é uma identidade de WhatsApp endereçável
-- como pessoa, e as consultas que casam `phone:`/`lid:` seguem sem grupo
-- nenhum no meio.
--
-- ## Por que uma RPC separada, e não um `p_kind='group'` na existente
--
-- `fn_upsert_wa_contact` tem `security definer`, grants explícitos e um
-- comentário de 17 linhas em `ingest.ts` avisando que ela NÃO valida `p_kind` e
-- que a allowlist do chamador é a única defesa. Acrescentar um kind ali mexe na
-- superfície mais sensível do ingest para ganhar o quê — um parâmetro a menos.
-- Função nova, contrato próprio, mesma postura de segurança.

-- ── 1. a chave de deduplicação do grupo ────────────────────────────────────
create unique index if not exists uniq_contacts_org_wa_group
  on public.contacts (organization_id, (source_metadata ->> 'waha_group_id'))
  where source_metadata ->> 'waha_group_id' is not null
    and is_merged_into is null;

comment on index public.uniq_contacts_org_wa_group is
  'Um contato por grupo de WhatsApp por organização. Parcial porque a esmagadora maioria dos contatos é pessoa e não tem esta chave.';

-- ── 2. o upsert do contato-grupo ───────────────────────────────────────────
create or replace function public.fn_upsert_wa_group_contact(
  p_org uuid,
  p_group_chat_id text,
  p_subject text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_chat text := nullif(trim(p_group_chat_id), '');
begin
  -- Sem chat id não há identidade: devolver null deixa o chamador decidir, e
  -- ele já sabe descartar (o ingest conta o descarte como anomalia).
  if v_chat is null then
    return null;
  end if;

  select id into v_id
    from public.contacts
   where organization_id = p_org
     and source_metadata ->> 'waha_group_id' = v_chat
     and is_merged_into is null
   limit 1;

  if v_id is not null then
    -- O ASSUNTO do grupo muda quando alguém renomeia, e o nome novo é o certo.
    -- Mas `display_name` também é onde uma PESSOA daqui pode ter escrito um
    -- apelido interno ("Grupo do João - orçamento aprovado"); sobrescrever isso
    -- a cada mensagem apagaria trabalho humano. Por isso o assunto vindo do
    -- WhatsApp entra em `name` (o dado da fonte) e `display_name` só é
    -- preenchido quando ainda está vazio.
    update public.contacts set
      name = coalesce(nullif(p_subject, ''), name),
      display_name = coalesce(display_name, nullif(p_subject, '')),
      last_activity_at = now(),
      updated_at = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.contacts (
    organization_id, name, display_name, source, source_metadata, last_activity_at
  ) values (
    p_org,
    nullif(p_subject, ''),
    nullif(p_subject, ''),
    'whatsapp_group',
    jsonb_build_object('waha_group_id', v_chat),
    now()
  )
  on conflict (organization_id, (source_metadata ->> 'waha_group_id'))
    where source_metadata ->> 'waha_group_id' is not null and is_merged_into is null
  do update set
    name = coalesce(excluded.name, public.contacts.name),
    last_activity_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end
$function$;

comment on function public.fn_upsert_wa_group_contact(uuid, text, text) is
  'Cria ou atualiza o contato que representa um GRUPO de WhatsApp. Identidade em source_metadata->>waha_group_id, não em wa_identity (que é gerada e só cobre pessoa).';

revoke all on function public.fn_upsert_wa_group_contact(uuid, text, text) from public;
revoke all on function public.fn_upsert_wa_group_contact(uuid, text, text) from anon;
revoke all on function public.fn_upsert_wa_group_contact(uuid, text, text) from authenticated;
grant execute on function public.fn_upsert_wa_group_contact(uuid, text, text) to service_role;

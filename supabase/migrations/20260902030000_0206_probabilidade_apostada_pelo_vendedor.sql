-- 0206 — a probabilidade que o VENDEDOR aposta, ao lado da que a IA calcula.
--
-- DIRC, antes de existir: não Duplica `crm_lead_scores.probability` — aquela é
-- derivada pela IA e reescrita a cada sinal novo, esta é julgamento humano e só
-- muda quando alguém a digita. Não Integra de outra tabela (não há FK possível
-- para um palpite). Não Referencia. E não Calcula: se desse para calcular já
-- seria o score. O valor das duas é serem discordantes — "o vendedor está mais
-- otimista que o modelo" é a leitura que faz o gerente olhar o negócio.
--
-- smallint e não numeric: é ponto percentual inteiro, e a tela não oferece
-- casa decimal. NULL é estado legítimo e o padrão — "não opinou" é diferente
-- de "acha que é 0%", e essa diferença muda a previsão ponderada.
alter table public.crm_leads
  add column if not exists commit_probability_pct smallint;

-- Dedup/correção ANTES da constraint (doutrina §8): banco de clone pode ter
-- recebido a coluna por caminho torto. Sem isto o `update.sh` de um clone
-- sujo quebraria ao criar a constraint.
update public.crm_leads
   set commit_probability_pct = null
 where commit_probability_pct is not null
   and (commit_probability_pct < 0 or commit_probability_pct > 100);

alter table public.crm_leads
  drop constraint if exists crm_leads_commit_probability_range;

alter table public.crm_leads
  add constraint crm_leads_commit_probability_range
  check (
    commit_probability_pct is null
    or (commit_probability_pct >= 0 and commit_probability_pct <= 100)
  );

comment on column public.crm_leads.commit_probability_pct is
  'Probabilidade de fechamento apostada pelo vendedor (0-100). NULL = não opinou. Distinta de crm_lead_scores.probability, que é da IA.';

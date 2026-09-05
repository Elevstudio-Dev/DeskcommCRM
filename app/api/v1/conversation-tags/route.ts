/**
 * GET /api/v1/conversation-tags — vocabulário canônico de marcadores da org.
 * PUT /api/v1/conversation-tags — grava o vocabulário. Manager+.
 *
 * Server route (não query browser-supabase direta): o cookie de sessão é
 * HttpOnly, então o client do browser não lê a sessão — leitura autenticada
 * passa pelo servidor, mesmo padrão do board de pipelines.
 *
 * ## O PUT existe desde 2026-09-05, e por quê
 *
 * `lib/operacao/marcadores-e-time.ts` já registrava a lacuna, em letras
 * maiúsculas: o vocabulário tinha rota de LEITURA e **nenhuma tela para ver ou
 * mudar**. Configuração alterável só por quem lê o banco viola o invariante 6 da
 * doutrina do sistema vivo ("toda configuração tem superfície") — e o efeito
 * prático era que o filtro por marcador só funcionava para quem já tivesse
 * marcadores gravados por alguém com acesso ao Postgres.
 *
 * ## Por que manager, e não agent
 *
 * Aplicar marcador numa conversa é atendimento e é `agent` (segue sendo, pelo
 * PATCH da conversa). DEFINIR o vocabulário é decisão de operação: é ele que faz
 * a contagem por marcador significar alguma coisa. Se todo atendente pudesse
 * editá-lo, a quarta variação de "urgente" entraria no vocabulário oficial em
 * vez de ficar visível como divergência — que é justamente o que
 * `listarMarcadores` distingue com o campo `oficial`.
 *
 * ## O PUT é substituição, não merge
 *
 * A tela manda a lista inteira. Merge exigiria um vocabulário de operações
 * (add/remove/rename) para dizer "apague este", e renomear seria indistinguível
 * de "adicione um e remova outro". Substituir é o que a tela realmente faz.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { canonicalConversationTagsSchema } from "@/lib/schemas/settings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const raw = (data?.settings as Record<string, unknown> | null)?.[
    "canonical_conversation_tags"
  ];
  // O parse normaliza a forma ANTIGA (`string[]`) para `{ nome, cor }` — ver
  // `canonicalConversationTagsSchema`. Toda instalação anterior a 2026-09-05 tem
  // a forma antiga gravada, e ela nunca é reescrita até alguém salvar pela tela.
  const tags = canonicalConversationTagsSchema.parse(raw ?? []);
  return ok(tags, { requestId });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg, user } = authz;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return fail("validation_failed", "Corpo inválido.", 422, { requestId });
  }

  // `safeParse` e não `parse`: o schema de leitura tem `.catch([])` para nunca
  // derrubar a TELA por dado velho no banco, e aquele mesmo `.catch` na ESCRITA
  // transformaria um corpo malformado em "apague todos os marcadores" — sem erro
  // nenhum para quem clicou em salvar. Aqui a lista chega da tela e recusar é o
  // certo.
  const lista = (corpo as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(lista)) {
    return fail("validation_failed", "Envie `tags` como lista.", 422, { requestId });
  }
  const parsed = canonicalConversationTagsSchema.safeParse(lista);
  if (!parsed.success) {
    return fail("validation_failed", "Marcadores inválidos.", 422, { requestId });
  }
  // `.catch([])` do schema converte QUALQUER falha em lista vazia, então
  // `success` sozinho não separa "lista vazia de propósito" de "lista inválida
  // engolida". A checagem explícita fecha isso: entrou com itens, saiu vazia = o
  // catch comeu o erro.
  if (lista.length > 0 && parsed.data.length === 0) {
    return fail("validation_failed", "Marcadores inválidos.", 422, { requestId });
  }

  const supabase = await createClient();
  const { data: orgAtual, error: erroLeitura } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });

  // Merge no jsonb inteiro, e não `settings = {...}`: `organizations.settings`
  // guarda MUITA coisa (marca, sla, idioma, elegibilidade). Substituí-lo apagaria
  // silenciosamente tudo o que não fosse marcador — e nada na tela diria por quê.
  const settings = {
    ...((orgAtual?.settings as Record<string, unknown> | null) ?? {}),
    canonical_conversation_tags: parsed.data,
  };

  const { error } = await supabase
    .from("organizations")
    .update({ settings })
    .eq("id", activeOrg.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    organizationId: activeOrg.orgId,
    actorUserId: user.id,
    action: "conversation_tags.updated",
    resourceType: "organizations",
    resourceId: activeOrg.orgId,
    requestId,
    metadata: { quantidade: parsed.data.length },
  });

  return ok(parsed.data, { requestId });
}

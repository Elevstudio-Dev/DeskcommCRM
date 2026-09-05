/**
 * POST /api/v1/whatsapp/groups/import — traz para o CRM os grupos que a conta
 * JÁ participa.
 *
 * ## Por que uma importação, e não só a ingestão
 *
 * A partir de 2026-09-05 (`CONVERSAS_IGNORADAS.groups = false` + migration
 * 0210) toda mensagem de grupo vira conversa. Só que isso só faz aparecer o
 * grupo em que ALGUÉM ESCREVEU depois de ligarmos a chave: um grupo parado há
 * uma semana continuaria invisível, e "cadê os meus grupos?" é a primeira coisa
 * que quem liga isso pergunta. Esta rota lê `GET /api/{session}/groups` do WAHA
 * — a lista que o aparelho tem — e cria o vínculo para cada um.
 *
 * ## Ela também é o único lugar que sabe o NOME do grupo
 *
 * O payload de uma mensagem de grupo traz `notifyName` de QUEM ESCREVEU, não o
 * assunto do grupo. Por isso `upsertGroupContact` (no ingest) cria sem nome:
 * batizar "Time comercial" de "Roberto" seria pior do que não batizar. O nome
 * real vem daqui, e por isso a importação é RE-EXECUTÁVEL de propósito —
 * rodá-la de novo conserta o nome de um grupo que chegou primeiro por mensagem,
 * e renomeia os que mudaram de assunto no WhatsApp.
 *
 * ## O que ela NÃO faz
 *
 * Não traz histórico de mensagem. O WAHA expõe o histórico de um chat, mas
 * importar conversa antiga de grupo é decisão de produto separada (volume,
 * LGPD, e o que fazer com mensagem de quem nunca falou com esta empresa). Aqui
 * o grupo nasce vazio e passa a receber o que chegar dali em diante.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWahaClient, wahaFriendlyError } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

interface Resultado {
  /** Quantos grupos o WhatsApp listou. */
  encontrados: number;
  /** Quantos ficaram com vínculo no CRM (novos + atualizados). */
  vinculados: number;
  /** Quantos falharam — contados, não escondidos. */
  falharam: number;
}

export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();

  // `manager` e não `agent`: importar grupo cria contato e conversa para a
  // organização inteira, e é uma ação de configuração do canal — não de
  // atendimento. Quem atende usa o que já está lá.
  const authz = await requireRole("manager", { requestId, resource: "channel_sessions" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  let corpo: { channel_session_id?: unknown } = {};
  try {
    corpo = (await req.json()) as { channel_session_id?: unknown };
  } catch {
    // Corpo ausente é aceito: a instalação típica tem UM número, e obrigar o
    // cliente a descobrir o id de uma sessão que ele nem vê seria burocracia.
    corpo = {};
  }
  const pedido =
    typeof corpo.channel_session_id === "string" && corpo.channel_session_id
      ? corpo.channel_session_id
      : null;

  const supabase = await createClient();
  // A sessão vem pela conexão do USUÁRIO (RLS), não pelo service role: é o que
  // impede alguém de importar os grupos do número de outra organização passando
  // um id adivinhado. O service role só entra depois, para escrever.
  // Duas closures, não um builder reaproveitado: o cliente do PostgREST é
  // thenable, então reusar o mesmo objeto na segunda tentativa reenviaria uma
  // requisição já resolvida (ver o cabeçalho de `queryTolerantToMissingArchived`).
  const buscar = (colunas: string) => {
    let q = supabase
      .from("channel_sessions")
      .select(colunas)
      .eq("organization_id", activeOrg.orgId)
      .eq("provider", "waha");
    if (pedido) q = q.eq("id", pedido);
    return q;
  };
  const { data: sessoesRaw, error: erroSessao } = await queryTolerantToMissingArchived(
    () => buscar(`id, session_name, provider, ${ARCHIVED_AT}`),
    () => buscar("id, session_name, provider"),
  );

  if (erroSessao) {
    return fail("db_error", "Não foi possível ler o número de WhatsApp.", 500, { requestId });
  }
  const sessoes = (sessoesRaw ?? []) as unknown as Array<{
    id: string;
    session_name: string | null;
    archived_at?: string | null;
  }>;
  // `== null` cobre os dois: a coluna ausente (schema antigo, o fallback acima)
  // e a coluna presente e nula (sessão viva). Uma sessão arquivada não entrega
  // nada — importar grupos por ela criaria conversas num canal morto.
  const viva = sessoes.find((s) => s.archived_at == null);
  if (!viva || !viva.session_name) {
    return fail(
      "no_channel",
      "Nenhum número de WhatsApp conectado nesta organização — conecte um antes de importar grupos.",
      404,
      { requestId },
    );
  }

  const waha = getWahaClient();
  if (!waha) {
    return fail(
      "waha_unavailable",
      "A conexão com o WhatsApp não está configurada neste servidor.",
      503,
      { requestId },
    );
  }

  let grupos: Array<{ chatId: string; subject: string | null }>;
  try {
    grupos = await waha.listGroups(viva.session_name);
  } catch (err) {
    // O texto vai para a tela, então passa pelo tradutor de falha de alcance —
    // "ECONNREFUSED" não diz nada a quem está tentando ver os próprios grupos.
    return fail("waha_error", wahaFriendlyError(err), 502, { requestId });
  }

  const admin = createAdminClient();
  const resultado: Resultado = { encontrados: grupos.length, vinculados: 0, falharam: 0 };

  for (const g of grupos) {
    // Um grupo que falha não derruba os outros: quem tem 40 grupos e um com
    // problema prefere 39 na tela a uma mensagem de erro e nenhum.
    const { data: contactId, error } = await admin.rpc("fn_upsert_wa_group_contact" as never, {
      p_org: activeOrg.orgId,
      p_group_chat_id: g.chatId,
      p_subject: g.subject,
    } as never);
    if (error || !contactId) {
      resultado.falharam += 1;
      logger.warn("grupos.import: contato do grupo não gravado", {
        organization_id: activeOrg.orgId,
        detail: (error?.message ?? "rpc devolveu vazio").slice(0, 160),
      });
      continue;
    }

    const { data: conversationId, error: erroConversa } = await admin.rpc(
      "fn_upsert_wa_conversation" as never,
      { p_org: activeOrg.orgId, p_contact: contactId, p_session: viva.id } as never,
    );
    if (erroConversa || !conversationId) {
      resultado.falharam += 1;
      logger.warn("grupos.import: conversa do grupo não criada", {
        organization_id: activeOrg.orgId,
        detail: (erroConversa?.message ?? "rpc devolveu vazio").slice(0, 160),
      });
      continue;
    }

    // A MARCA é o que mantém a IA calada neste grupo: o filtro `ignore_groups`
    // do despachante (`lib/ai/dispatcher/triggers.ts`) lê `is_group`. Uma
    // conversa de grupo sem a marca é uma conversa de grupo em que o agente
    // pode responder — por isso a falha aqui CONTA como falha do grupo inteiro,
    // e não como detalhe cosmético.
    const { error: erroMarca } = await admin
      .from("conversations")
      .update({ is_group: true, group_chat_id: g.chatId })
      .eq("organization_id", activeOrg.orgId)
      .eq("id", conversationId as string);
    if (erroMarca) {
      resultado.falharam += 1;
      logger.error("grupos.import: conversa ficou sem a marca de grupo", {
        organization_id: activeOrg.orgId,
        conversation_id: conversationId as string,
        detail: erroMarca.message.slice(0, 160),
      });
      continue;
    }

    resultado.vinculados += 1;
  }

  logger.info("grupos.import: concluída", {
    organization_id: activeOrg.orgId,
    encontrados: resultado.encontrados,
    vinculados: resultado.vinculados,
    falharam: resultado.falharam,
  });

  return ok(resultado, { requestId });
}

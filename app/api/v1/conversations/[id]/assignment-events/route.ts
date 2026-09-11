/**
 * GET /api/v1/conversations/[id]/assignment-events — quem assumiu, largou,
 * transferiu ou recebeu esta conversa, na ordem em que aconteceu.
 *
 * ## Por que esta rota existe
 *
 * `conversation_assignment_events` é escrita desde sempre, na MESMA transação da
 * troca de dono, por `fn_conversation_assign` — e nunca teve leitor de tela.
 * `lib/inbox/atividade-de-comando.ts` levou a mesma informação para a linha do
 * tempo do CRM, mas o cabeçalho dele diz o que aquilo NÃO conserta:
 * `crm_lead_activities.lead_id` é `NOT NULL`, então conversa sem negócio aberto
 * não tem onde pendurar a linha e a atividade simplesmente não nasce.
 *
 * Resultado prático até aqui: numa conversa sem negócio — a maioria, no começo
 * de um atendimento — o atendente não via em lugar nenhum que outra pessoa tinha
 * assumido. Ele abria, via a conversa "normal", e respondia por cima de alguém.
 *
 * Esta rota lê a tabela de auditoria, que não depende de negócio nenhum.
 *
 * ## O nome
 *
 * A tabela guarda só ids. O nome vem de `nomesDosAtendentes`, que custa **uma
 * requisição HTTP por id ÚNICO** ao GoTrue — aceitável aqui porque o escopo é UMA
 * conversa (tipicamente 1 a 3 pessoas distintas), e inaceitável na listagem, que
 * é justamente por isso que a listagem usa a coluna desnormalizada.
 *
 * Sem service role o mapa volta VAZIO (declarado, não acidental — ver
 * `lib/users/nome-do-atendente.ts`). Por isso o fallback: quando o evento aponta
 * para o dono ATUAL da conversa, o nome sai de `conversations.assigned_to_user_name`,
 * que a migration 0202 desnormaliza na linha. Cobre o caso comum (o último
 * "assumiu") mesmo numa instalação sem service role.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "conversation_assignment_events",
  });
  if (!authz.ok) return authz.response;
  const { org } = authz;
  const { id } = await params;

  const supabase = await createClient();
  // Mesma confirmação das outras rotas de conversa: 404 honesto em vez de vazar
  // a existência de uma conversa de outra organização.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, assigned_to_user_id, assigned_to_user_name")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!conversation) return fail("not_found", "Conversa não encontrada.", 404, { requestId });

  const { data, error } = await supabase
    .from("conversation_assignment_events")
    .select("id, reason, from_user_id, to_user_id, changed_by, created_at, from_sector_id, to_sector_id")
    .eq("conversation_id", id)
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: true });
  if (error) {
    return fail("internal_error", "Erro ao listar o histórico de responsável.", 500, { requestId });
  }

  const eventos = (data ?? []) as Array<{
    id: string;
    reason: string;
    from_user_id: string | null;
    to_user_id: string | null;
    changed_by: string | null;
    created_at: string;
    from_sector_id: string | null;
    to_sector_id: string | null;
  }>;

  // Os nomes dos setores citados — inclusive arquivados: o fio conta história,
  // e "transferida para ?" não é história.
  const idsDeSetor = [...new Set(eventos.flatMap((e) => [e.from_sector_id, e.to_sector_id]).filter((x): x is string => !!x))];
  const nomesDeSetor = new Map<string, string>();
  if (idsDeSetor.length > 0) {
    const { data: setores } = await supabase
      .from("sectors")
      .select("id, name")
      .eq("organization_id", org.orgId)
      .in("id", idsDeSetor);
    for (const s of (setores ?? []) as Array<{ id: string; name: string }>) nomesDeSetor.set(s.id, s.name);
  }

  const nomes = await nomesDosAtendentes(
    eventos.flatMap((e) => [e.to_user_id, e.from_user_id, e.changed_by]),
  );
  const dono = conversation as { assigned_to_user_id: string | null; assigned_to_user_name: string | null };
  const nomeDe = (userId: string | null): string | null => {
    if (!userId) return null;
    const doMapa = nomes.get(userId);
    if (doMapa) return doMapa;
    // Ver o cabeçalho: sem service role o mapa vem vazio, e a coluna
    // desnormalizada da própria conversa salva o caso mais visto.
    if (dono.assigned_to_user_id === userId && dono.assigned_to_user_name) {
      return dono.assigned_to_user_name;
    }
    return null;
  };

  return ok(
    eventos.map((e) => ({
      id: e.id,
      reason: e.reason,
      created_at: e.created_at,
      to_user_id: e.to_user_id,
      from_user_id: e.from_user_id,
      changed_by: e.changed_by,
      to_user_name: nomeDe(e.to_user_id),
      from_user_name: nomeDe(e.from_user_id),
      changed_by_name: nomeDe(e.changed_by),
      from_sector_id: e.from_sector_id,
      to_sector_id: e.to_sector_id,
      from_sector_name: e.from_sector_id ? (nomesDeSetor.get(e.from_sector_id) ?? null) : null,
      to_sector_name: e.to_sector_id ? (nomesDeSetor.get(e.to_sector_id) ?? null) : null,
    })),
    { requestId },
  );
}

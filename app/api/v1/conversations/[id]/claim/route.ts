/**
 * POST /api/v1/conversations/[id]/claim — atendente assume a conversa.
 *
 * Concorrência: o UPDATE só vence se o assignee atual for NULL ou bater com
 * `expected_assignee` (optimistic lock). Se 0 linhas → 409 (outro atendente
 * já assumiu).
 *
 * G3-01: a mudança de dono acontece via rpc `fn_conversation_assign`
 * (migration 0031), que faz o UPDATE condicional + INSERT do evento em
 * `conversation_assignment_events` (reason='claim') na MESMA transação.
 *
 * 0173: essa mesma RPC agora grava `bot_silenced_until='infinity'` — assumir CALA
 * o atendimento automático. Antes disso o motor moderno nunca soube que alguém
 * assumiu (ele não lê `assignee_kind`) e os dois atendiam o mesmo cliente.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { negocioQueHerdaODono } from "@/lib/leads/dono-ao-assumir";
import { logger } from "@/lib/logger";
import { claimConversationSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/messaging";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const user = authz.user;

  let input;
  try {
    input = await validateRequest(claimConversationSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // Optimistic lock (spec 04 §9.2): expected null/omitido = só assume se livre;
  // expected uuid = takeover consciente. UPDATE + evento na mesma transação.
  const { data, error } = await supabase.rpc("fn_conversation_assign", {
    p_organization_id: authz.org.orgId,
    p_conversation_id: id,
    p_to_user_id: user.id,
    p_reason: "claim",
    ...(input.expected_assignee ? { p_expected_assignee: input.expected_assignee } : {}),
    p_enforce_expected: true,
  });

  if (error) {
    return fail("internal_error", error.message, 500, { requestId });
  }
  const row = data?.[0];
  if (!row) {
    return fail("state_conflict", "Outro atendente já assumiu.", 409, { requestId });
  }

  const conv = row as unknown as Conversation;

  await audit({
    action: "conversation.claimed",
    actorUserId: user.id,
    organizationId: conv.organization_id,
    resourceType: "conversation",
    resourceId: conv.id,
    requestId,
  });

  await supabase
    .rpc("emit_event", {
      p_event_type: "conversation.claimed",
      p_entity_kind: "conversation",
      p_entity_id: conv.id,
      p_payload: { assigned_to_user_id: user.id },
      p_metadata: { request_id: requestId },
      p_organization_id: conv.organization_id,
    })
    .then(({ error: emitErr }) => {
      if (emitErr) console.error("[conversation.claim] emit_event failed", emitErr.message);
    });

  // A linha na TELA. O `emit_event` acima e o audit não são lidos por atendente
  // nenhum; sem esta chamada, assumir uma conversa era invisível na timeline —
  // grep por atividade nas três rotas de troca de dono devolvia zero.
  await registrarTrocaDeComando({
    supabase,
    organizationId: conv.organization_id,
    conversationId: conv.id,
    contactId: conv.contact_id,
    tipo: "conversation_claimed",
    actor: { type: "user", id: user.id, role: authz.org.role },
    motivo: "Assumiu o atendimento desta conversa",
  });

  // O DONO DO NEGÓCIO — quando não há dúvida de qual.
  //
  // FORA da transação da RPC, de propósito. Assumir a conversa é o que o
  // atendente pediu; o funil ganhar dono é consequência. Uma consequência que
  // falha não pode desfazer o pedido — por isso erro aqui vira log e a resposta
  // segue 200. A regra de QUAL negócio herda vive em `lib/leads/dono-ao-assumir.ts`,
  // separada porque é decisão, não consulta.
  if (conv.contact_id) {
    try {
      const { data: abertos, error: buscaErr } = await supabase
        .from("crm_leads")
        .select("id, owner_user_id, owner_agent_id")
        .eq("organization_id", conv.organization_id)
        .eq("contact_id", conv.contact_id)
        .eq("status", "open");

      if (buscaErr) throw new Error(buscaErr.message);

      const alvoId = negocioQueHerdaODono(abertos ?? []);
      if (alvoId) {
        const agora = new Date().toISOString();
        const { error: donoErr } = await supabase
          .from("crm_leads")
          .update({
            owner_user_id: user.id,
            // Derivado aqui, nunca vindo do cliente — é o que mantém a
            // constraint `crm_leads_owner_kind_coherence` fora do alcance de
            // quem chama a rota.
            owner_kind: "user",
            assigned_at: agora,
            updated_at: agora,
          })
          .eq("id", alvoId)
          .eq("organization_id", conv.organization_id);

        if (donoErr) throw new Error(donoErr.message);

        await audit({
          action: "lead.updated",
          actorUserId: user.id,
          organizationId: conv.organization_id,
          resourceType: "lead",
          resourceId: alvoId,
          requestId,
        });
      }
    } catch (err) {
      logger.warn("[conversation.claim] não consegui dar dono ao negócio", {
        conversationId: conv.id,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return ok(conv, { requestId });
}

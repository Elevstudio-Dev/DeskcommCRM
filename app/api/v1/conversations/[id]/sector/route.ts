/**
 * POST /api/v1/conversations/[id]/sector — transfere a conversa para um SETOR
 * (ou tira de qualquer setor, com `sector_id: null`). `agent+`.
 *
 * A escrita é `fn_conversation_set_sector` (migration 0213): grava o setor,
 * DEVOLVE a conversa à fila (o responsável de antes pode nem ser do setor
 * novo) e registra o evento `sector_transfer` na mesma transação. Depois, o
 * rodízio do setor é acordado com `conversation.routing_requested` — o mesmo
 * evento que o nascimento da conversa emite — e o worker atribui entre os
 * membros do setor, se o modo for rodízio.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { transferirParaSetorSchema } from "@/lib/schemas/setores";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/messaging";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const orgId = authz.org.orgId;

  let input;
  try {
    input = await validateRequest(transferirParaSetorSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();
  let nomeDoSetor: string | null = null;
  if (input.sector_id) {
    const { data: setor } = await supabase
      .from("sectors")
      .select("name")
      .eq("organization_id", orgId)
      .eq("id", input.sector_id)
      .is("archived_at", null)
      .maybeSingle();
    if (!setor) return fail("unprocessable_entity", "Setor não encontrado.", 422, { requestId });
    nomeDoSetor = (setor as { name: string }).name;
  }

  const { data, error } = await supabase.rpc("fn_conversation_set_sector" as never, {
    p_organization_id: orgId,
    p_conversation_id: id,
    p_sector_id: input.sector_id,
    p_reason: "sector_transfer",
  } as never);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const row = (data as unknown[] | null)?.[0];
  if (!row) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  const conv = row as Conversation;

  await audit({
    action: "conversation.sector_changed",
    actorUserId: user.id,
    organizationId: conv.organization_id,
    resourceType: "conversation",
    resourceId: conv.id,
    requestId,
    metadata: { sector_id: input.sector_id },
  });

  if (input.sector_id) {
    await supabase
      .rpc("emit_event", {
        p_event_type: "conversation.routing_requested",
        p_entity_kind: "conversation",
        p_entity_id: conv.id,
        p_payload: { conversation_id: conv.id, organization_id: conv.organization_id },
        p_metadata: { request_id: requestId, source: "sector_transfer" },
        p_organization_id: conv.organization_id,
      })
      .then(({ error: emitErr }) => {
        if (emitErr) console.error("[conversation.sector] emit_event failed", emitErr.message);
      });
  }

  await registrarTrocaDeComando({
    supabase,
    organizationId: conv.organization_id,
    conversationId: conv.id,
    contactId: conv.contact_id,
    tipo: "conversation_transferred",
    actor: { type: "user", id: user.id, role: authz.org.role },
    motivo: nomeDoSetor ? `Transferiu a conversa para o setor ${nomeDoSetor}` : "Tirou a conversa do setor",
    payload: { sector_id: input.sector_id },
  });

  return ok(conv, { requestId });
}

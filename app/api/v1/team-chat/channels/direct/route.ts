/**
 * POST /api/v1/team-chat/channels/direct — acha ou cria a conversa direta
 * entre quem está logado e `user_id`. `agent+`.
 *
 * Criação pelo admin client (com a org resolvida do cookie, nunca do body):
 * pelo cliente de sessão ninguém cria canal, e é assim de propósito — o par
 * de membros nasce junto, na mesma request, e a chave do par garante que dois
 * cliques simultâneos não viram dois canais.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { chaveDoParDireto } from "@/lib/chat-interno/canais";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({ user_id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "team_chat" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  const outro = parsed.data.user_id;
  if (outro === user.id) return fail("unprocessable_entity", "Uma conversa precisa de duas pessoas.", 422, { requestId });

  const admin = createAdminClient();
  const { data: membro } = await admin
    .from("user_organizations")
    .select("role")
    .eq("organization_id", org.orgId)
    .eq("user_id", outro)
    .is("revoked_at", null)
    .maybeSingle();
  if (!membro || (membro as { role: string }).role === "viewer") {
    return fail("unprocessable_entity", "Essa pessoa não faz parte da equipe desta organização.", 422, { requestId });
  }

  const chave = chaveDoParDireto(user.id, outro);
  const { data: existente } = await admin
    .from("team_channels")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("kind", "direto")
    .eq("direct_key", chave)
    .maybeSingle();
  if (existente) return ok({ id: (existente as { id: string }).id, created: false }, { requestId });

  const { data: criado, error } = await admin
    .from("team_channels")
    .insert({ organization_id: org.orgId, kind: "direto", direct_key: chave })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Perdeu a corrida para o outro clique: devolve o vencedor.
      const { data: vencedor } = await admin
        .from("team_channels")
        .select("id")
        .eq("organization_id", org.orgId)
        .eq("kind", "direto")
        .eq("direct_key", chave)
        .maybeSingle();
      if (vencedor) return ok({ id: (vencedor as { id: string }).id, created: false }, { requestId });
    }
    return fail("internal_error", "Erro ao abrir a conversa.", 500, { requestId });
  }
  const id = (criado as { id: string }).id;
  await admin.from("team_channel_members").insert([
    { channel_id: id, user_id: user.id, organization_id: org.orgId },
    { channel_id: id, user_id: outro, organization_id: org.orgId },
  ]);
  return ok({ id, created: true }, { requestId, status: 201 });
}

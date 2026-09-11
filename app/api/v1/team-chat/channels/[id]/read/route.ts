/**
 * POST /api/v1/team-chat/channels/[id]/read — "li até agora". Cria ou avança
 * a linha da própria pessoa em `team_channel_members`; é o que zera o
 * contador de não lidas daquele canal. `agent+`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "team_chat" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const supabase = await createClient();
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("team_channel_members")
    .upsert({ channel_id: id, user_id: user.id, organization_id: org.orgId, last_read_at: agora }, { onConflict: "channel_id,user_id" });
  if (error) {
    if (error.code === "42501") return fail("not_found", "Canal não encontrado.", 404, { requestId });
    return fail("internal_error", "Erro ao marcar como lido.", 500, { requestId });
  }
  return ok({ channel_id: id, last_read_at: agora }, { requestId });
}

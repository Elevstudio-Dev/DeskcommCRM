/**
 * PUT /api/v1/sectors/[id]/members — define QUEM está no setor: a lista
 * inteira, de uma vez. Quem não está nela sai. (`manager+`)
 *
 * Os ids precisam ser membros ativos da organização: a RLS de
 * `user_organizations` só mostra o próprio vínculo a um agent, então a
 * conferência usa o admin client filtrado pela org resolvida — como o
 * `transfer` faz para o destino.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { setorMembrosSchema } from "@/lib/schemas/setores";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "sectors" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const raw = await req.json().catch(() => null);
  const parsed = setorMembrosSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const userIds = [...new Set(parsed.data.user_ids)];

  const supabase = await createClient();
  const { data: setor } = await supabase
    .from("sectors")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!setor) return fail("not_found", "Setor não encontrado.", 404, { requestId });

  if (userIds.length > 0 && isServiceRoleConfigured()) {
    const admin = createAdminClient();
    const { data: membros, error } = await admin
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", org.orgId)
      .in("user_id", userIds)
      .is("revoked_at", null);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    const validos = new Set(((membros ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));
    const estranhos = userIds.filter((u) => !validos.has(u));
    if (estranhos.length > 0) {
      return fail("unprocessable_entity", "Alguém da lista não é membro desta organização.", 422, {
        requestId,
        details: { user_ids: estranhos },
      });
    }
  }

  const { error: delErr } = await supabase
    .from("sector_members")
    .delete()
    .eq("organization_id", org.orgId)
    .eq("sector_id", id);
  if (delErr) return fail("internal_error", "Erro ao atualizar membros.", 500, { requestId });

  if (userIds.length > 0) {
    const { error: insErr } = await supabase
      .from("sector_members")
      .insert(userIds.map((user_id) => ({ sector_id: id, user_id, organization_id: org.orgId })));
    if (insErr) return fail("internal_error", "Erro ao atualizar membros.", 500, { requestId });
  }

  void audit({
    action: "sector.members_changed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "sector",
    resourceId: id,
    requestId,
    metadata: { count: userIds.length },
  });
  return ok({ sector_id: id, member_user_ids: userIds }, { requestId });
}

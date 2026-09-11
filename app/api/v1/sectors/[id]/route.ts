/**
 * PATCH  /api/v1/sectors/[id] — renomeia, recolore, reordena, arquiva ou
 *        desarquiva (`manager+`).
 * DELETE /api/v1/sectors/[id] — ARQUIVA. Não apaga: as conversas que passaram
 *        por ele guardam o `sector_id` nos eventos, e um setor apagado viraria
 *        um buraco na história do fio ("transferida para ?").
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { setorPatchSchema } from "@/lib/schemas/setores";
import { createClient } from "@/lib/supabase/server";

import { COLS } from "../route";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "sectors" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const raw = await req.json().catch(() => null);
  const parsed = setorPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const { archived, ...campos } = parsed.data;
  const patch: Record<string, unknown> = { ...campos, updated_at: new Date().toISOString() };
  if (archived !== undefined) patch.archived_at = archived ? new Date().toISOString() : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sectors")
    .update(patch)
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return fail("conflict", "Já existe um setor com esse nome.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao alterar setor.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Setor não encontrado.", 404, { requestId });

  void audit({
    action: "sector.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "sector",
    resourceId: id,
    requestId,
    metadata: parsed.data,
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "sectors" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sectors")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao arquivar setor.", 500, { requestId });
  if (!data) return fail("not_found", "Setor não encontrado.", 404, { requestId });

  void audit({
    action: "sector.archived",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "sector",
    resourceId: id,
    requestId,
  });
  return ok({ id, archived: true }, { requestId });
}

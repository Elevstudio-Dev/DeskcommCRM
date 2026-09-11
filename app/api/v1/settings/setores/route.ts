/**
 * GET   /api/v1/settings/setores — como o menu de primeiro contato se comporta
 *       (`agent+`: a tela de setores e o inbox leem; nada aqui é sensível).
 * PATCH /api/v1/settings/setores — grava (`manager+`). Merge não-destrutivo
 *       de `organizations.settings.setores`, preservando as demais chaves.
 *
 * MOLDE: `app/api/v1/settings/routing/route.ts` — inclusive a escrita pelo
 * admin client, porque a única policy de escrita de `organizations` é a do
 * platform admin, e pelo client de sessão o UPDATE de um manager casa zero
 * linhas com sucesso.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { configuracaoDeSetoresPatchSchema, lerConfiguracaoDeSetores } from "@/lib/schemas/setores";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "settings_setores" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: orgRow, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(lerConfiguracaoDeSetores(orgRow?.settings ?? null), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "settings_setores" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  let input;
  try {
    input = await validateRequest(configuracaoDeSetoresPatchSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const admin = createAdminClient();
  if (input.setor_padrao_id) {
    const { data: setor } = await admin
      .from("sectors")
      .select("id")
      .eq("organization_id", org.orgId)
      .eq("id", input.setor_padrao_id)
      .is("archived_at", null)
      .maybeSingle();
    if (!setor) return fail("unprocessable_entity", "Setor padrão não encontrado.", 422, { requestId });
  }

  const { data: orgRow, error: readErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (readErr) return fail("internal_error", readErr.message, 500, { requestId });

  const atual = (orgRow?.settings as Record<string, unknown> | null) ?? {};
  const setores = { ...lerConfiguracaoDeSetores(atual), ...input };
  const { error: updErr } = await admin
    .from("organizations")
    .update({ settings: { ...atual, setores } })
    .eq("id", org.orgId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  void audit({
    action: "sectors.menu_config_changed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    requestId,
    metadata: input,
  });
  return ok(setores, { requestId });
}

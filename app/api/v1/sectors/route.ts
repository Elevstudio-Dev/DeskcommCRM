/**
 * GET  /api/v1/sectors — os setores da organização ativa, com os membros de
 *      cada um. `agent+`: quem atende precisa da lista para filtrar o inbox e
 *      transferir; a RLS `sectors_select` já limita à org.
 * POST /api/v1/sectors — cria um setor (`manager+`, cobrado pela RLS
 *      `sectors_write` e re-afirmado aqui para o erro ser legível).
 *
 * Migration 0213. O menu de primeiro contato lê esta mesma tabela.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { setorCreateSchema } from "@/lib/schemas/setores";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const COLS = "id, organization_id, name, color, position, archived_at, created_at, updated_at";

export interface SetorComMembros {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  member_user_ids: string[];
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "sectors" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const incluirArquivados = new URL(req.url).searchParams.get("archived") === "true";
  const supabase = await createClient();
  let consulta = supabase
    .from("sectors")
    .select(COLS)
    .eq("organization_id", org.orgId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!incluirArquivados) consulta = consulta.is("archived_at", null);
  const { data: setores, error } = await consulta;
  if (error) return fail("internal_error", "Erro ao listar setores.", 500, { requestId });

  const { data: membros, error: errMembros } = await supabase
    .from("sector_members")
    .select("sector_id, user_id")
    .eq("organization_id", org.orgId);
  if (errMembros) return fail("internal_error", "Erro ao listar membros dos setores.", 500, { requestId });

  const porSetor = new Map<string, string[]>();
  for (const m of (membros ?? []) as Array<{ sector_id: string; user_id: string }>) {
    porSetor.set(m.sector_id, [...(porSetor.get(m.sector_id) ?? []), m.user_id]);
  }
  const lista: SetorComMembros[] = ((setores ?? []) as Omit<SetorComMembros, "member_user_ids">[]).map((s) => ({
    ...s,
    member_user_ids: porSetor.get(s.id) ?? [],
  }));
  return ok(lista, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "sectors" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const raw = await req.json().catch(() => null);
  const parsed = setorCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  // Posição = depois do último: a ordem da tela é a ordem do menu do cliente.
  const { data: ultimo } = await supabase
    .from("sectors")
    .select("position")
    .eq("organization_id", org.orgId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((ultimo as { position?: number } | null)?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("sectors")
    .insert({ organization_id: org.orgId, name: parsed.data.name, color: parsed.data.color, position })
    .select(COLS)
    .single();
  if (error) {
    // 23505 = o índice único de nome entre os ativos.
    if (error.code === "23505") {
      return fail("conflict", "Já existe um setor com esse nome.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao criar setor.", 500, { requestId });
  }

  void audit({
    action: "sector.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "sector",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { name: parsed.data.name },
  });
  return ok({ ...(data as object), member_user_ids: [] }, { requestId, status: 201 });
}

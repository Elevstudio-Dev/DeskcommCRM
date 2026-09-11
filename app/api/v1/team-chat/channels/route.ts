/**
 * GET /api/v1/team-chat/channels — os canais que quem está logado vê: o Geral,
 * os setores dele (todos, para manager+) e as conversas diretas — cada um com
 * o contador de não lidas e a última mensagem. `agent+` (viewer é leitura do
 * CRM, não parte da equipe de atendimento).
 *
 * Os canais `geral` e `setor` nascem AQUI, sob demanda, pelo admin client
 * filtrado pela org: não há tela de "criar canal" — o Geral existe porque a
 * organização existe, e o canal de um setor existe porque o setor existe.
 * Migration 0214.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { contarNaoLidas, ordenarCanais, outroDoPar, type CanalDaEquipe } from "@/lib/chat-interno/canais";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export const dynamic = "force-dynamic";

interface CanalRow {
  id: string;
  kind: "geral" | "setor" | "direto";
  sector_id: string | null;
  direct_key: string | null;
}

/** Cria o que falta (geral + um por setor visível). Idempotente; erro vira log. */
async function garantirCanais(orgId: string, sectorIds: string[]): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: existentes } = await admin
      .from("team_channels")
      .select("kind, sector_id")
      .eq("organization_id", orgId)
      .in("kind", ["geral", "setor"]);
    const rows = (existentes ?? []) as Array<{ kind: string; sector_id: string | null }>;
    const temGeral = rows.some((r) => r.kind === "geral");
    const setoresComCanal = new Set(rows.filter((r) => r.kind === "setor").map((r) => r.sector_id));
    const novos: Array<{ organization_id: string; kind: string; sector_id: string | null }> = [];
    if (!temGeral) novos.push({ organization_id: orgId, kind: "geral", sector_id: null });
    for (const s of sectorIds) if (!setoresComCanal.has(s)) novos.push({ organization_id: orgId, kind: "setor", sector_id: s });
    if (novos.length === 0) return;
    const { error } = await admin.from("team_channels").insert(novos);
    // 23505 = duas requests criaram ao mesmo tempo; a segunda perde e está tudo bem.
    if (error && error.code !== "23505") {
      logger.warn("chat interno: não deu para criar canais", { organization_id: orgId, detail: error.message });
    }
  } catch (err) {
    logger.warn("chat interno: garantirCanais falhou", {
      organization_id: orgId,
      detail: err instanceof Error ? err.message : "desconhecido",
    });
  }
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "team_chat" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const supabase = await createClient();

  // Os setores que esta pessoa enxerga (a RLS de `sectors` é org-wide; a
  // regra "só os meus" é a do CANAL, então filtra-se aqui para criar só os
  // canais que a pessoa vai ver).
  const [{ data: setores }, { data: minhasMembresias }] = await Promise.all([
    supabase.from("sectors").select("id, name, color").eq("organization_id", org.orgId).is("archived_at", null),
    supabase.from("sector_members").select("sector_id").eq("organization_id", org.orgId).eq("user_id", user.id),
  ]);
  const todosOsSetores = (setores ?? []) as Array<{ id: string; name: string; color: string }>;
  const meusSetores = new Set(((minhasMembresias ?? []) as Array<{ sector_id: string }>).map((m) => m.sector_id));
  const setoresVisiveis = roleAtLeast(org.role, "manager") || user.is_platform_admin
    ? todosOsSetores
    : todosOsSetores.filter((s) => meusSetores.has(s.id));
  await garantirCanais(org.orgId, setoresVisiveis.map((s) => s.id));

  // A RLS decide o que volta: geral, os setores certos, os diretos em que estou.
  const { data: canaisBrutos, error } = await supabase
    .from("team_channels")
    .select("id, kind, sector_id, direct_key")
    .eq("organization_id", org.orgId);
  if (error) return fail("internal_error", "Erro ao listar canais.", 500, { requestId });
  const canais = (canaisBrutos ?? []) as CanalRow[];
  if (canais.length === 0) return ok([], { requestId });

  const ids = canais.map((c) => c.id);
  const [{ data: membresias }, { data: recentes }] = await Promise.all([
    supabase.from("team_channel_members").select("channel_id, last_read_at").eq("user_id", user.id).in("channel_id", ids),
    // As últimas 500 da organização, uma consulta só: dão a última mensagem de
    // cada canal e o contador de não lidas. Quem tem mais de 500 não lidas tem
    // um problema que um número exato não resolve.
    supabase
      .from("team_messages")
      .select("channel_id, body, sender_name, sender_user_id, created_at")
      .eq("organization_id", org.orgId)
      .in("channel_id", ids)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const lidoAte = new Map(
    ((membresias ?? []) as Array<{ channel_id: string; last_read_at: string | null }>).map((m) => [m.channel_id, m.last_read_at]),
  );
  const porCanal = new Map<string, Array<{ body: string; sender_name: string | null; sender_user_id: string | null; created_at: string }>>();
  for (const m of (recentes ?? []) as Array<{ channel_id: string; body: string; sender_name: string | null; sender_user_id: string | null; created_at: string }>) {
    porCanal.set(m.channel_id, [...(porCanal.get(m.channel_id) ?? []), m]);
  }

  const setorPorId = new Map(todosOsSetores.map((s) => [s.id, s]));
  const outros = canais
    .filter((c) => c.kind === "direto" && c.direct_key)
    .map((c) => outroDoPar(c.direct_key!, user.id))
    .filter((x): x is string => !!x);
  const nomes = await nomesDosAtendentes(outros);
  const agora = new Date();

  const lista: CanalDaEquipe[] = canais.map((c) => {
    const mensagens = porCanal.get(c.id) ?? [];
    const ultima = mensagens[0] ?? null;
    const outro = c.kind === "direto" && c.direct_key ? outroDoPar(c.direct_key, user.id) : null;
    const setor = c.sector_id ? setorPorId.get(c.sector_id) : undefined;
    return {
      id: c.id,
      kind: c.kind,
      name:
        c.kind === "geral"
          ? "Geral"
          : c.kind === "setor"
            ? (setor?.name ?? "Setor")
            : ((outro && nomes.get(outro)) || "Colega"),
      sector_id: c.sector_id,
      sector_color: setor?.color ?? null,
      other_user_id: outro,
      unread: contarNaoLidas(mensagens, user.id, lidoAte.get(c.id) ?? null, agora),
      last_message: ultima ? { body: ultima.body, sender_name: ultima.sender_name, created_at: ultima.created_at } : null,
    };
  });

  return ok(ordenarCanais(lista), { requestId });
}

/**
 * GET /api/v1/settings/sla — em quantos minutos a primeira resposta vira alarme.
 *
 * MOLDE: `app/api/v1/settings/routing/route.ts`, que le do MESMO jsonb
 * (`organizations.settings`). Aqui so ha GET — escrever o valor e outra
 * entrega, e uma rota que so le nao precisa do merge nao-destrutivo que o
 * PATCH de routing faz para preservar as demais chaves.
 *
 * `requireRole("agent")` e nao `manager`: quem ATENDE precisa ver o contador de
 * espera no cabecalho da conversa, e o numero nao e sensivel. O gate de
 * `manager` do routing existe porque aquela rota tambem ESCREVE.
 *
 * O PISO mora em `lib/inbox/tempo-sem-resposta.ts` e e aplicado aqui, no
 * servidor: assim toda tela que consumir esta rota recebe um numero utilizavel,
 * em vez de cada uma reimplementar "o que fazer quando ninguem configurou".
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { PISO_MINUTOS } from "@/lib/inbox/tempo-sem-resposta";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("agent", { requestId, resource: "settings_sla" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: orgRow, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();

  if (error) {
    return fail("internal_error", error.message, 500, { requestId });
  }

  const settings = (orgRow?.settings as Record<string, unknown> | null) ?? {};
  const sla = (settings.sla as Record<string, unknown> | undefined) ?? {};
  const bruto = sla.primeira_resposta_minutos;

  // Valor invalido (texto, negativo, zero) cai no piso em vez de virar erro:
  // uma configuracao mal preenchida nao deve derrubar o cabecalho da conversa.
  const minutos = typeof bruto === "number" && bruto > 0 ? bruto : PISO_MINUTOS;

  return ok({ primeira_resposta_minutos: minutos }, { requestId });
}

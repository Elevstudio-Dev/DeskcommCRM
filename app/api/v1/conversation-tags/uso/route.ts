/**
 * GET /api/v1/conversation-tags/uso — cada marcador e QUANTAS conversas o
 * carregam agora.
 *
 * ## Por que uma rota separada do vocabulário
 *
 * `GET /api/v1/conversation-tags` responde "o que a empresa declarou" e é lido
 * pelo inbox a cada carregamento — barato, cacheado por 5 minutos. Esta responde
 * "o que a operação está usando", e para isso varre até 2.000 conversas. Juntar
 * as duas faria toda abertura do inbox pagar a varredura.
 *
 * ## A contagem não é nova
 *
 * `listarMarcadores` existe desde o épico da operação e era lida SÓ pelo agente
 * de IA — para ele não inventar a quarta variação de "urgente". A conta que o
 * dono da loja quer ("quantas conversas por marcador") é exatamente a mesma, e
 * duplicá-la num SQL próprio criaria dois números que divergiriam no dia em que
 * um dos dois mudasse de régua.
 *
 * O campo `oficial` é o que dá sentido ao resto: separa o marcador que a empresa
 * declarou daquele que nasceu no uso, digitado por um atendente. Os dois contam;
 * só um está no vocabulário.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { listarMarcadores } from "@/lib/operacao/marcadores-e-time";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  // `manager`: é a tela de configuração da operação, e é quem decide o
  // vocabulário que precisa ver o efeito dele. Quem atende usa o filtro, que já
  // é `agent` pela rota do vocabulário.
  const authz = await requireRole("manager", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg, user } = authz;

  const supabase = await createClient();
  try {
    const marcadores = await listarMarcadores({
      supabase,
      organizationId: activeOrg.orgId,
      actor: { type: "user", id: user.id },
      requestId,
    });
    return ok(marcadores, { requestId });
  } catch (err) {
    // `listarMarcadores` lança `ApiError` — repassar o código dela é o que
    // mantém a mensagem honesta em vez de virar um 500 genérico.
    if (err instanceof ApiError) {
      return fail("internal_error", "Erro ao contar os marcadores.", err.status, { requestId });
    }
    throw err;
  }
}

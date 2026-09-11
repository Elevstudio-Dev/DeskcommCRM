import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { SetoresClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * Setores da empresa — quem atende o quê, e o menu de primeiro contato.
 *
 * `manager`, como Marcadores: definir a organização do atendimento é operação,
 * e é o manager quem responde pela fila. Pedido do dono: "em vez de atendente,
 * ter setores — assistência, financeiro, recepção". Migration 0213.
 */
export default async function SetoresPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const idioma = user.idioma;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <header>
        <h1 className="text-lg font-semibold">{traduzir("Setores", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Os grupos que atendem junto — e o menu que pergunta ao cliente com quem ele quer falar.",
            idioma,
          )}
        </p>
      </header>
      <SetoresClient />
    </div>
  );
}

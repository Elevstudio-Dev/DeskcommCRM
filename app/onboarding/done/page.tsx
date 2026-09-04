import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { contextoDoOnboarding, resumoDoOnboarding } from "@/lib/onboarding/passos";
import { env } from "@/lib/env";
import { oQueMaisExiste } from "@/lib/onboarding/o-que-mais-existe";
import { DoneClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function DonePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");

  const { state } = await loadOnboardingState(activeOrg.orgId);

  // O resumo sai da MESMA fonte que decidiu a ordem e desenhou o indicador.
  // Antes era uma terceira lista, fixa, e por isso ela listava "Loja Nuvemshop
  // (pulado)" em instalações que nunca ofereceram esse passo — o wizard
  // acusando a pessoa de não fazer o que ninguém lhe pediu.
  const ctx = contextoDoOnboarding(state, { lojaLigada: env.NUVEMSHOP_ENABLED });
  const itens = resumoDoOnboarding(state, ctx);

  return (
    <DoneClient
      itens={itens}
      pecas={oQueMaisExiste()}
      // Quem escolheu só o CRM não viu nenhuma tela de IA — e "configuro
      // depois" vira "nunca" quando não há porta à vista no momento em que a
      // pessoa termina. Ver o cabeçalho de `DoneClient`.
      iaFicouParaDepois={!ctx.comIa}
    />
  );
}

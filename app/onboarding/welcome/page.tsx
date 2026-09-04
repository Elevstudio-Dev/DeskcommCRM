import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { WelcomeForm } from "./_form";
import { branding } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { lerRetratoDaInstalacao } from "@/lib/instalacao/retrato";
import { JaEstaPronto } from "../_components/JaEstaPronto";
import { traduzir } from "@/lib/i18n/dicionario";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;

  const supabase = await createClient();
  const retrato = await lerRetratoDaInstalacao({ supabase, orgId: activeOrg.orgId });
  // O caminho escolhido decide o VOCABULÁRIO desta tela. Falar de "quem vai
  // atender seus clientes" a quem escolheu começar só com o CRM é descrever um
  // funcionário que ela decidiu não contratar agora.
  const { state } = await loadOnboardingState(activeOrg.orgId);
  const comIa = state.caminho !== "so_crm";

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          {traduzir("Boas-vindas ao", idioma)} {branding().name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {comIa
            ? traduzir("Vamos montar quem vai atender seus clientes — e onde ele vai trabalhar.", idioma)
            : traduzir("Vamos configurar o seu negócio e onde a sua equipe vai trabalhar.", idioma)}
        </p>
      </header>

      <JaEstaPronto retrato={retrato} idioma={idioma} comIa={comIa} />

      {/*
        O instalador NUNCA pergunta o nome do negócio: toda organização nasce
        "Minha Empresa", hardcoded. Mandar esse texto como valor inicial fazia a
        pessoa ter de apagá-lo antes de escrever o nome dela — e quem não
        percebia seguia com o placeholder no cabeçalho do sistema para sempre.
      */}
      <WelcomeForm comIa={comIa} defaultOrgName={retrato.empresa.aindaSemNomeProprio ? "" : activeOrg.name} />
    </div>
  );
}

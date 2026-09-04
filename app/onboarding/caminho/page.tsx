import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { branding } from "@/lib/branding";
import { traduzir } from "@/lib/i18n/dicionario";

import { CaminhoForm } from "./_form";

export const dynamic = "force-dynamic";

/**
 * A BIFURCAÇÃO — o primeiro passo do wizard.
 *
 * O wizard nasceu contando uma história só: a de contratar um funcionário de
 * IA. Quem quer o CRM agora e a IA depois era obrigado a atravessar decisões
 * que ainda não tinha como tomar — qual provedor, qual chave, qual prompt — ou
 * a pular telas e terminar com um resumo cheio de pendências.
 */
export default async function CaminhoPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          {traduzir("Boas-vindas ao", idioma)} {branding().name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {traduzir("Por onde você quer começar? Dá para mudar de ideia depois.", idioma)}
        </p>
      </header>

      <CaminhoForm />
    </div>
  );
}

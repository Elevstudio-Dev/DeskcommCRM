import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { canonicalConversationTagsSchema } from "@/lib/schemas/settings";
import { createClient } from "@/lib/supabase/server";

import { MarcadoresClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * Marcadores da empresa — a superfície que faltava.
 *
 * `manager` e não `admin`: definir vocabulário de atendimento é operação, e é o
 * manager quem responde pela fila. As outras telas deste diretório pedem `admin`
 * porque mexem em cadastro, cobrança e retenção — coisas que o manager não
 * decide.
 *
 * O vocabulário é lido no SERVIDOR e passa como `inicial` para o cliente, para a
 * tela não abrir vazia e preencher depois: a lista de marcadores é curta e já
 * está na linha da organização que esta página leria de qualquer jeito.
 */
export default async function MarcadoresPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();

  const inicial = canonicalConversationTagsSchema.parse(
    (data?.settings as Record<string, unknown> | null)?.["canonical_conversation_tags"] ?? [],
  );
  const idioma = user.idioma;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold">{traduzir("Marcadores", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "O vocabulário de marcadores da sua empresa — o que dá para filtrar e o que dá para medir.",
            idioma,
          )}
        </p>
      </header>
      <MarcadoresClient inicial={inicial} />
    </div>
  );
}

import { Inventario } from "@/components/shell/Inventario";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

/**
 * Configurações — o inventário do produto inteiro.
 *
 * Era o hub só de "Organização" (conta, empresa, acesso), e o resto das telas
 * morava no menu lateral. O menu saiu (2026-09-10): a barra superior ficou com
 * as cinco abas de uso diário, e TUDO o mais passou a ser alcançável daqui —
 * Atendimento, CRM, Agente de IA, Canais, Análise e Organização, cada grupo
 * uma seção, cada tela um card com a frase que diz para que serve.
 *
 * O conteúdo vem do registro (`inventario()`), não de uma lista escrita aqui:
 * a lista de cards que existiu nesta página era uma segunda navegação à mão e
 * divergia do menu. Tela nova entra no registro e aparece aqui sozinha.
 */
export default async function SettingsHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const idioma = user.idioma;

  return (
    <Inventario
      isPlatformAdmin={user.is_platform_admin}
      role={activeOrg?.role ?? null}
      title={traduzir("Configurações", idioma)}
      subtitle={traduzir("Tudo que o sistema tem, em um lugar só: atendimento, CRM, IA, canais, análise e a sua empresa.", idioma)}
      locale={idioma}
    />
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { GRUPO_DAS_CONFIGURACOES, NAV_GROUPS, inventario } from "@/lib/navigation/registry";
import { Gear } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O inventário em forma de LISTA — a gaveta do celular.
 *
 * No desktop o inventário é a tela de Configurações, em cards com descrição.
 * No celular ele cabe numa gaveta que rola, e é a mesma projeção
 * (`inventario()`) desenhada em linhas: todo grupo, toda tela que o papel vê,
 * e Configurações fixo no rodapé, fora da área que rola — porque é o item que
 * mais se procura quando não se acha algo.
 */
export function MenuCompleto({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const grupos = inventario(user.is_platform_admin, activeOrg?.role ?? null).filter(
    (g) => g.group.id !== GRUPO_DAS_CONFIGURACOES,
  );
  const configuracoes = NAV_GROUPS.find((g) => g.id === GRUPO_DAS_CONFIGURACOES)?.hub;
  const ativo = (href: string) => pathname === href || pathname.startsWith(href + "/");
  // Etapas do funil e Marcadores moram em `/app/settings/tenant/*` e são CRM:
  // quando uma delas está aberta, é ELA que acende, e não Configurações junto.
  const algumItemAceso = grupos.some((g) => g.sections.some((s) => s.items.some((i) => ativo(i.href))));
  const configuracoesAceso =
    configuracoes !== undefined && ativo(configuracoes.href) && !algumItemAceso;

  const classeDoLink = (ativo: boolean) =>
    cn(
      "relative flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
      ativo
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    );

  return (
    <>
      <nav className="flex-1 space-y-3 overflow-y-auto p-2" aria-label={t("Todas as telas")}>
        {grupos.map(({ group, sections }) => {
          const tituloId = `menu-grupo-${group.id}`;
          return (
            <div key={group.id} className="space-y-1">
              <h2
                id={tituloId}
                className="px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {t(group.label)}
              </h2>
              <ul aria-labelledby={tituloId} className="space-y-0.5">
                {sections.flatMap((s) => s.items).map((item) => {
                  const aceso = ativo(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={aceso ? "page" : undefined}
                        onClick={onNavigate}
                        className={classeDoLink(aceso)}
                      >
                        <Icon size={18} weight={aceso ? "fill" : "regular"} aria-hidden />
                        <span className="truncate">{t(item.label)}</span>
                        {item.healthDot && <ConnectionHealthDot className="ml-auto" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      {configuracoes && (
        <div className="border-t p-2">
          <Link
            href={configuracoes.href}
            aria-current={configuracoesAceso ? "page" : undefined}
            onClick={onNavigate}
            className={classeDoLink(configuracoesAceso)}
          >
            <Gear size={18} aria-hidden />
            <span className="truncate">{t(configuracoes.label)}</span>
          </Link>
        </div>
      )}
    </>
  );
}

import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { Role } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO, type Idioma } from "@/lib/i18n/idiomas";
import { inventario, type NavDestination } from "@/lib/navigation/registry";

interface InventarioProps {
  isPlatformAdmin: boolean;
  role: Role | null;
  title: string;
  subtitle: string;
  locale?: Idioma;
}

/**
 * `aria-labelledby` separa múltiplos ids por ESPAÇO — então um id com espaço
 * ("inv-ia-Ensinar o agente") vira três referências quebradas e a seção fica
 * sem rótulo acessível. O slug é o que mantém a região anunciável.
 */
function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function CartaoDeDestino({ item, locale }: { item: NavDestination; locale: Idioma }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="block">
      <Card className="flex h-full gap-3 p-4 transition-colors hover:border-border-strong">
        <Icon size={20} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold">{traduzir(item.label, locale)}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{traduzir(item.description, locale)}</p>
        </div>
      </Card>
    </Link>
  );
}

/**
 * CONFIGURAÇÕES — o inventário do produto inteiro, numa tela só.
 *
 * Todo grupo do registro, toda tela que este papel vê, cada uma com a frase
 * que explica para que serve. É a segunda porta do produto: o que não é aba
 * da barra superior se acha aqui (ou no ⌘K, que varre o mesmo registro).
 *
 * Era o hub só do grupo "Organização", e o resto morava no menu lateral. O
 * menu saiu (ver `lib/navigation/registry.ts`), e o inventário absorveu os
 * cinco grupos que ele carregava. Trinta e poucos cards é muito para uma
 * tela — por isso a fila de âncoras no topo: um clique por grupo, sem rolar.
 *
 * Server Component, como o `NavHub`: `traduzir` é pura e roda sem provider.
 */
export function Inventario({ isPlatformAdmin, role, title, subtitle, locale = IDIOMA_PADRAO }: InventarioProps) {
  const grupos = inventario(isPlatformAdmin, role);

  return (
    <div className="flex h-full flex-col gap-8 p-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{traduzir(title, locale)}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{traduzir(subtitle, locale)}</p>}
        </div>
        <nav aria-label={traduzir("Grupos", locale)} className="flex flex-wrap gap-1.5">
          {grupos.map(({ group }) => (
            <a
              key={group.id}
              href={`#grupo-${group.id}`}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              {traduzir(group.label, locale)}
            </a>
          ))}
        </nav>
      </header>

      {grupos.map(({ group, sections }) => (
        <section
          key={group.id}
          id={`grupo-${group.id}`}
          aria-labelledby={`inv-${group.id}`}
          className="scroll-mt-20 space-y-4"
        >
          <h2 id={`inv-${group.id}`} className="text-lg font-semibold tracking-tight">
            {traduzir(group.label, locale)}
          </h2>
          {sections.map(({ section, items }) => (
            <div
              key={section || "_"}
              role={section ? "region" : undefined}
              aria-labelledby={section ? `inv-${group.id}-${slug(section)}` : undefined}
              className="space-y-3"
            >
              {section && (
                <h3
                  id={`inv-${group.id}-${slug(section)}`}
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {traduzir(section, locale)}
                </h3>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <CartaoDeDestino key={item.href} item={item} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

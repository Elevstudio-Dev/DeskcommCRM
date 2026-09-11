"use client";
import Link from "next/link";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { ArrowCircleUp } from "@/lib/ui/icons";

/**
 * Versão instalada, no menu do usuário. Vira um aviso clicável só para quem
 * é dono do servidor E tem versão nova — quem não pode atualizar não é
 * alertado sobre algo que não pode resolver.
 *
 * Era o rodapé do menu lateral. O menu saiu, e o lugar que sobrou com a mesma
 * natureza — "coisas sobre esta instalação, fora do fluxo de trabalho" — é o
 * menu do avatar. O sinal ambiente de versão nova (a bolinha que pulsava no
 * rodapé) passou para o próprio avatar: ver `UserMenu`.
 */
export function VersaoNoMenu() {
  const t = useT();
  const { data } = useSystemVersion();
  if (!data?.current_version) return null;

  const label = data.current_version.replace(/^v/i, "");
  // Só acende quando existe versão nova de verdade. `off_release` sozinho não
  // conta: uma instalação de desenvolvimento sem versão publicada mais nova
  // ficava com o aviso aceso pra sempre, apontando para uma tela que não tem o
  // que oferecer.
  const alerta = data.is_owner && data.update_available;

  if (!alerta) {
    return (
      <>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground" title={`${t("Versão")} ${label}`}>
          {t("versão")} {label}
        </div>
      </>
    );
  }

  const novo = data.latest_version?.replace(/^v/i, "") ?? "";
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link
          href="/app/settings/atualizacao"
          title={`${t("Nova versão")} ${novo} ${t("disponível")}`}
          className="flex items-center gap-2"
        >
          <ArrowCircleUp size={16} aria-hidden className="text-primary" />
          <span className="truncate">
            {t("Nova versão")}
            {novo ? ` · ${novo}` : ""}
          </span>
        </Link>
      </DropdownMenuItem>
    </>
  );
}

/**
 * O ponto que pulsa sobre o avatar quando há versão nova para o dono — o sinal
 * ambiente que o rodapé do menu lateral dava e que não podia sumir junto com
 * ele: sem isto, o dono só saberia da versão nova abrindo o menu por acaso.
 */
export function PontoDeVersaoNova() {
  const { data } = useSystemVersion();
  if (!data?.is_owner || !data.update_available) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
    </span>
  );
}

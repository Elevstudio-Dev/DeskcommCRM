"use client";
import type { ReactNode } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useNotifyOpenFromServiceWorker } from "@/lib/notifications/notify_open";

interface AppShellProps {
  children: ReactNode;
}

/**
 * A casca do app do tenant: barra superior + conteúdo. Só isso.
 *
 * ⚠️ O MENU LATERAL FOI REMOVIDO (2026-09-10). Ele ocupava 240px (64
 * recolhido) de toda tela, e a tela que importa — o inbox — é a que mais
 * sentia: em 1280px sobravam 1040 para três colunas. Toda a navegação passou
 * para a barra superior (abas de uso diário) e para Configurações (o
 * inventário). Ver `lib/navigation/registry.ts`.
 *
 * Com a barra fora, o `flex` horizontal e o `min-w-0` que existiam para a
 * coluna de conteúdo dividir a linha com ela deixaram de ter razão de ser: o
 * conteúdo É a linha.
 */
export function AppShell({ children }: AppShellProps) {
  useInboundMessageAlerts();
  useCrmAlerts();
  useNotifyOpenFromServiceWorker();
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <TopBar />
      {/*
        `p-6` é a moldura padrão de toda tela. A EXCEÇÃO é declarada pela
        própria tela, não decidida aqui por rota: quem renderiza um filho com
        `data-tela-cheia` (o inbox) recebe o `main` sem moldura, de borda a
        borda. É CSS puro (`:has`), então servidor e navegador pintam o mesmo
        — não há estado de cliente para divergir e piscar.

        A alternativa era o `main` olhar o `pathname`, e aí a casca passaria a
        conhecer rotas — a mesma acoplagem que o registro de navegação existe
        para evitar.
      */}
      <main className="flex-1 overflow-auto p-6 [&:has([data-tela-cheia])]:p-0">{children}</main>
    </div>
  );
}

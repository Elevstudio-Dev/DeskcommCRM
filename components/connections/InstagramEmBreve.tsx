"use client";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock } from "@/lib/ui/icons";

/**
 * A conexão do Instagram Direct — pronta por dentro, desligada por fora.
 *
 * ## Por que uma tela, e não um recurso escondido
 *
 * O canal já existe no vocabulário do sistema: tem provider no banco (migration
 * 0211), capabilities declaradas, adapter registrado e falha de forma honesta se
 * alguém tentar enviar. O que falta não é código nosso — é a aprovação da Meta,
 * que tem prazo próprio e não depende deste repositório.
 *
 * Esconder a aba até lá deixaria o cliente perguntando se o sistema faz ou não
 * faz Instagram. Mostrá-la com o botão desligado responde a pergunta E diz o que
 * falta — que é a diferença entre "ainda não" e "não".
 *
 * ## Por que a lista de pré-requisitos aparece
 *
 * Os três itens abaixo correm em PARALELO ao nosso trabalho e nenhum deles é
 * instantâneo: App Review pede vídeo de demonstração, a verificação de empresa
 * pede documento, e converter a conta para profissional é do lado do cliente.
 * Quem lê isto hoje pode começar hoje — e é justamente por isso que a tela
 * existe antes da conexão.
 */
export function InstagramEmBreve() {
  const t = useT();

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <Clock size={20} weight="duotone" className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("Instagram Direct — em breve")}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t(
              "As mensagens de Direct, as respostas a stories e os pedidos de mensagem vão cair na mesma caixa de entrada das conversas de WhatsApp.",
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("O que já está pronto")}
        </h3>
        {/*
          TRÊS `<li>` escritos, e não um `.map` sobre um array de strings.
          A guarda de i18n lê o ARQUIVO: `t(variavel)` ela não consegue casar
          com uma chave, então o array virava "literal renderizado" — texto em
          português que ela não sabe provar que passa pelo tradutor. Repetir a
          marcação custa três linhas; o `.map` custava a cobertura.
        */}
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-start gap-2">
            <CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span className="text-muted-foreground">
              {t("O canal existe no sistema, ao lado do WhatsApp")}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span className="text-muted-foreground">
              {t("A caixa de entrada, os marcadores e a fila já funcionam para ele")}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span className="text-muted-foreground">
              {t("A IA segue as mesmas regras de silêncio que você já configurou")}
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("O que falta, e não depende de nós")}
        </h3>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
          <li>{t("A conta do Instagram precisa ser Profissional e estar ligada a uma Página do Facebook.")}</li>
          <li>{t("A Meta precisa aprovar o aplicativo para ler e responder mensagens (App Review).")}</li>
          <li>{t("Dependendo do caso, a Meta pede também a verificação da empresa, com documento.")}</li>
        </ul>
        <p className="max-w-prose text-xs text-muted-foreground">
          {t(
            "Esses três passos correm por fora e levam de dias a semanas. Assim que a aprovação sair, esta tela ganha o botão de conectar.",
          )}
        </p>
      </div>

      <div className="mt-5">
        {/*
          O botao desligado, e nao ausente: ele mostra ONDE a acao vai aparecer.
          Um espaco vazio com um texto "em breve" faria a pessoa procurar o botao
          em outro lugar quando ele existisse.
        */}
        {/*
          `title` junto do `disabled` não é enfeite: é o padrão que
          `controle-decorativo.test.ts` cobra, e a razão está escrita lá —
          botão cinza sem motivo à vista faz a pessoa concluir que o produto
          está quebrado, sem ter o que reportar além de "não acontece nada".
          O motivo aparece no hover E na lista acima, para quem não tem hover.
        */}
        <Button
          disabled
          variant="outline"
          size="sm"
          title={t("Disponível assim que a Meta aprovar o aplicativo.")}
          data-testid="conectar-instagram"
        >
          {t("Conectar Instagram")}
        </Button>
        <span className="ml-2 text-xs text-muted-foreground">{t("Disponível em breve")}</span>
      </div>
    </div>
  );
}

"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { format } from "date-fns";
import { useT } from "@/hooks/i18n/useT";
import { ArrowBendUpLeft, Check, Checks, Robot, WarningOctagon } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Message } from "@/lib/types/messaging";
import { CitationButton } from "@/components/ai/CitationButton";
import { MediaRenderer } from "@/components/inbox/media/MediaRenderer";
import { ContactCard } from "@/components/inbox/media/ContactCard";
import {
  extractCitations,
  isAiGeneratedMessage,
} from "@/lib/ai/citations/types";

interface Props {
  message: Message;
  debugCitations?: boolean;
  /** Escolher esta mensagem para responder "em cima" dela. */
  onResponder?: (m: Message) => void;
  /** A mensagem citada por ESTA, quando houver — desenha o fio. */
  citada?: Message | null;
  /**
   * Esta bolha ABRE um bloco de falas seguidas do mesmo lado?
   *
   * Só a primeira leva rabinho. É assim no WhatsApp e não é enfeite: o rabinho
   * marca onde a fala começa. Repetido em toda bolha ele vira ruído, e o bloco
   * perde a leitura de "isto tudo é a mesma pessoa falando seguido".
   *
   * O padrão é `true` porque uma bolha solta é, por definição, a primeira do
   * seu bloco — assim quem renderiza uma sozinha não precisa saber desta regra.
   */
  primeiraDoGrupo?: boolean;
}

function AckIndicator({ status, t }: { status: string; t: (texto: string) => string }) {
  if (status === "read") {
    return <Checks size={12} weight="bold" className="text-blue-400" aria-label={t("Lida")} />;
  }
  if (status === "delivered") {
    return <Checks size={12} weight="bold" className="text-current/70" aria-label={t("Entregue")} />;
  }
  if (status === "sent") {
    return <Check size={12} weight="bold" className="text-current/70" aria-label={t("Enviada")} />;
  }
  return null;
}

export function MessageBubble({
  message,
  debugCitations,
  onResponder,
  citada,
  primeiraDoGrupo = true,
}: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const isOutbound = message.direction === "outbound";
  const time = format(new Date(message.sent_at), "HH:mm", { locale: localeDaData });
  const isFailed = message.status === "failed";
  const hasMedia = Boolean(message.media_url || message.media_storage_path);
  const isContact = message.type === "contact";
  // Figurinha sem caption: sem moldura de bolha (padrão WhatsApp).
  const isBareSticker = hasMedia && message.type === "sticker" && !message.body;
  // Apagada pelo autor ("apagar para todos"). A linha continua no histórico —
  // sumir com ela deixaria a resposta seguinte respondendo ao nada —, mas o
  // texto não aparece: mostrá-lo seria expor justamente o que o cliente pediu
  // para tirar do ar.
  const apagada = Boolean(message.revoked_at);
  const editada = Boolean(message.edited_at) && !apagada;
  const aiGenerated = isAiGeneratedMessage(message.metadata);
  const citations = extractCitations(message.metadata);
  const showCitationButton =
    isOutbound && aiGenerated && (debugCitations ?? false);
  const senderLabel = (() => {
    if (!isOutbound) return null;
    if (message.sent_via === "ai") return "IA";
    return null;
  })();

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1 px-4",
        // O ESPAÇAMENTO CONTA A MESMA HISTÓRIA QUE O RABINHO: dentro de um
        // bloco as bolhas quase se encostam; entre blocos abre. É o que faz
        // "três mensagens seguidas do cliente" ser lido como um turno de fala,
        // e não como três eventos soltos.
        //
        // Mora aqui, e não num `space-y` do container, porque só esta linha
        // sabe se abre bloco — e `space-y` no pai brigaria com margem no filho.
        primeiraDoGrupo ? "pb-[2px] pt-2" : "py-[2px]",
        isOutbound ? "justify-end" : "justify-start",
      )}
    >
      {/*
        RESPONDER — aparece ao passar o mouse, como no WhatsApp Web.
        Fica FORA da bolha para não disputar espaço com o texto, e do lado de
        dentro da conversa (à esquerda no que sai, à direita no que entra), que
        é onde a mão já está.

        `opacity` e não `hidden`: esconder de verdade faria o layout pular
        quando o mouse entra. Em telas de toque não há hover — por isso
        `focus-visible` também revela, e o teclado alcança.
      */}
      {onResponder && isOutbound && (
        <button
          type="button"
          onClick={() => onResponder(message)}
          aria-label={t("Responder a esta mensagem")}
          className={cn(
            "rounded-md p-1 text-muted-foreground transition-opacity hover:bg-muted",
            // VISÍVEL POR PADRÃO, e escondido só onde EXISTE hover.
            //
            // A primeira versão era `opacity-0` + `group-hover`, copiando o
            // WhatsApp Web. No celular isso deixa o botão invisível para
            // sempre: não há como passar o mouse, e `focus-visible` só chega
            // por teclado. Ou seja, a função sumia exatamente onde o dono
            // deste CRM mais atende.
            //
            // `@media (hover: hover)` pergunta pelo DISPOSITIVO, não pela
            // largura: um tablet largo com toque continua mostrando, e um
            // desktop estreito continua escondendo. Largura não é a pergunta.
            "opacity-100 [@media(hover:hover)]:opacity-0",
            "[@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <ArrowBendUpLeft size={14} />
        </button>
      )}
      <div
        className={cn(
          // 65% e não 75%: linha longa demais cansa, e a largura curta é o que
          // faz o bloco de mensagens ter ritmo em vez de virar parede de texto.
          "max-w-[65%] text-sm",
          isBareSticker
            ? "px-0 py-0"
            : cn(
                // `rounded-lg` (8px) e não `rounded-2xl` (16px): a bolha muito
                // arredondada briga com o rabinho, que é reto.
                "inbox-bolha rounded-lg px-2.5 py-1.5",
                isOutbound
                  ? "inbox-bolha-saida bg-[var(--chat-out)] text-[var(--chat-out-fg)]"
                  : "inbox-bolha-entrada bg-[var(--chat-in)] text-[var(--chat-in-fg)]",
                // O canto DO RABINHO fica reto — é ele que vira o rabinho.
                primeiraDoGrupo &&
                  cn("inbox-bolha-rabinho", isOutbound ? "rounded-tr-none" : "rounded-tl-none"),
              ),
          isFailed && "border border-destructive",
        )}
      >
        {/*
          A CITAÇÃO, dentro da bolha e acima do texto — o fio.

          Mostra de quem era e um trecho. `line-clamp-2` porque serve para
          reconhecer, não para reler: a original está logo acima no histórico.
        */}
        {citada && (
          <div
            className={cn(
              "mb-1 rounded-md border-l-2 px-2 py-1 text-xs",
              isOutbound
                ? "border-[var(--chat-out-fg)]/50 bg-[var(--chat-out-fg)]/10"
                : "border-[var(--chat-out)] bg-black/[0.04] dark:bg-white/[0.06]",
            )}
          >
            <div className="font-medium opacity-80">
              {citada.direction === "outbound" ? t("Você") : t("Cliente")}
            </div>
            {/*
              A CITADA PODE TER SIDO APAGADA — e aí o texto dela não volta aqui.

              A bolha principal já trata isto (`apagada`, acima): "mostrá-lo
              seria expor justamente o que o cliente pediu para tirar do ar". A
              citação é o mesmo texto, num segundo lugar da tela — sem esta
              linha, o "apagar para todos" do cliente sumia da bolha original e
              continuava legível dentro de cada resposta que a citou. O fio
              permanece (a citação some, não a resposta); o conteúdo, não.
            */}
            <div className={cn("line-clamp-2 opacity-70", citada.revoked_at && "italic")}>
              {citada.revoked_at
                ? t("Esta mensagem foi apagada")
                : citada.body?.trim() || t("(sem texto)")}
            </div>
          </div>
        )}
        {senderLabel && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            {senderLabel === "IA" ? (
              <Robot size={10} weight="duotone" aria-hidden />
            ) : null}
            {senderLabel && t(senderLabel)}
          </div>
        )}

        {apagada ? (
          // Nem corpo nem mídia: o anexo apagado também sai. Em itálico e
          // esmaecido porque não é texto de ninguém — é o CRM narrando o que
          // aconteceu com aquele lugar da conversa.
          <p className="whitespace-pre-wrap break-words italic leading-snug opacity-60">
            {t("Esta mensagem foi apagada")}
          </p>
        ) : (
          <>
            {hasMedia && (
              <div className={cn(message.body && "mb-1")}>
                <MediaRenderer message={message} />
              </div>
            )}

            {isContact && !hasMedia && (
              <div className={cn(message.body && isContact && "mb-1")}>
                <ContactCard message={message} />
              </div>
            )}

            {message.body && !isContact && (
              <p className="whitespace-pre-wrap break-words leading-snug">{message.body}</p>
            )}
          </>
        )}

        <div
          className={cn(
            // `-mt-0.5` e não `mt-1`: a hora encosta na última linha do texto,
            // como no WhatsApp. Com folga inteira, a bolha ganha uma faixa vazia
            // que a faz parecer alta demais para o que diz.
            "-mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            // A hora é referência, não conteúdo — no lado de saída ela herda a
            // cor do texto com opacidade, o que funciona em qualquer marca que
            // o revendedor escolher. Cor própria aqui exigiria uma segunda
            // rampa por marca, e a que envelhece primeiro é sempre a cópia.
            isOutbound ? "text-[var(--chat-out-fg)]/75" : "text-muted-foreground",
          )}
        >
          {editada && (
            // Ao lado da hora, não no corpo: o texto mostrado JÁ é o novo, e o
            // que falta é avisar que ele mudou. Sem isso, um combinado de preço
            // ou endereço é lido como se sempre tivesse dito aquilo — e a
            // divergência só aparece quando alguém cobra o que não foi.
            <span title={t("O autor editou esta mensagem")}>{t("editada")}</span>
          )}
          <span>{time}</span>
          {showCitationButton && (
            <CitationButton citations={citations} messageId={message.id} />
          )}
          {isOutbound && !isFailed && <AckIndicator status={message.status} t={t} />}
          {isFailed && (
            // Provider local: o painel do inbox não tem TooltipProvider ancestral e
            // este Tooltip só monta em mensagem failed — sem o provider, abrir uma
            // conversa com falha de envio derrubava o painel inteiro (error boundary).
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-semibold",
                      // VERMELHO NÃO SOBREVIVE À COR DA MARCA. Na bolha de
                      // saída o fundo é `--chat-out`, que o revendedor troca em
                      // runtime — não há vermelho que tenha contraste contra
                      // todos. Medido a olho em 2026-09-04 com a accent padrão
                      // (verde-sálvia): "Falhou" ficava ilegível nos dois temas.
                      //
                      // Do lado de dentro da bolha, quem carrega o alarme é o
                      // ÍCONE e o peso da fonte; a cor herda o texto da bolha,
                      // que por construção já tem contraste com ela.
                      isOutbound ? "text-[var(--chat-out-fg)]" : "text-destructive",
                    )}
                  >
                    <WarningOctagon size={10} weight="fill" aria-hidden /> {t("Falhou")}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {message.error_message ?? message.error_code ?? t("Erro desconhecido")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      {onResponder && !isOutbound && (
        <button
          type="button"
          onClick={() => onResponder(message)}
          aria-label={t("Responder a esta mensagem")}
          className={cn(
            "rounded-md p-1 text-muted-foreground transition-opacity hover:bg-muted",
            // VISÍVEL POR PADRÃO, e escondido só onde EXISTE hover.
            //
            // A primeira versão era `opacity-0` + `group-hover`, copiando o
            // WhatsApp Web. No celular isso deixa o botão invisível para
            // sempre: não há como passar o mouse, e `focus-visible` só chega
            // por teclado. Ou seja, a função sumia exatamente onde o dono
            // deste CRM mais atende.
            //
            // `@media (hover: hover)` pergunta pelo DISPOSITIVO, não pela
            // largura: um tablet largo com toque continua mostrando, e um
            // desktop estreito continua escondendo. Largura não é a pergunta.
            "opacity-100 [@media(hover:hover)]:opacity-0",
            "[@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <ArrowBendUpLeft size={14} />
        </button>
      )}
    </div>
  );
}

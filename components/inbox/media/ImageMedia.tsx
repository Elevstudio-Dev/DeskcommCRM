"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { MediaUnavailable } from "./MediaUnavailable";
import { mediaSrc } from "./media-utils";

interface Props {
  messageId: string;
  alt: string;
}

/** Miniatura na bolha + lightbox (Dialog) no clique. Padrão WhatsApp Web. */
export function ImageMedia({ messageId, alt }: Props) {
  const t = useT();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState(false);
  const src = mediaSrc(messageId);

  if (state === "error")
    return (
      <div className="w-64 max-w-full aspect-[4/3]">
        <MediaUnavailable kind="Imagem" className="h-full w-full" />
      </div>
    );

  return (
    <>
      <button
        type="button"
        aria-label={t("Ampliar imagem")}
        onClick={() => setOpen(true)}
        disabled={state !== "ready"}
        aria-disabled={state !== "ready"}
        className={cn(
          "relative block w-64 max-w-full aspect-[4/3] overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-ring",
          state === "ready" ? "cursor-zoom-in" : "cursor-not-allowed opacity-50",
        )}
      >
        {state === "loading" && <Skeleton className="absolute inset-0 h-full w-full" />}
        <img src={src} alt={alt} loading="lazy" onLoad={() => setState("ready")} onError={() => setState("error")} className="h-full w-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/*
          O BOTÃO DE FECHAR PRECISA DE FUNDO PRÓPRIO AQUI.

          O `DialogContent` desenha um `X` de 16px, sem fundo, herdando a cor do
          texto — o que funciona num diálogo branco e SOME sobre uma foto. Medido
          em 2026-09-04: 16×16, `background: rgba(0,0,0,0)`, cor `rgb(28,26,22)`.
          Sobre uma foto clara ele é quase invisível; sobre uma escura, invisível.
          O dono abriu uma imagem e relatou que "não tem a opção de fechar" — ela
          tinha, com dezesseis pixels de alvo e sem contraste.

          As classes abaixo mexem SÓ neste diálogo, pelo seletor de filho: dão
          círculo escuro, ícone branco e 36px de alvo. Trocar isso no
          `components/ui/dialog.tsx` mudaria todo diálogo do produto, e os
          outros não têm o problema — eles têm fundo sólido atrás do botão.
        */}
        <DialogContent
          className={cn(
            "max-w-4xl border-none bg-transparent p-0 shadow-none",
            "[&>button]:right-2 [&>button]:top-2 [&>button]:grid [&>button]:size-9 [&>button]:place-items-center",
            "[&>button]:rounded-full [&>button]:bg-black/65 [&>button]:text-white [&>button]:opacity-100",
            "[&>button]:backdrop-blur-sm [&>button:hover]:bg-black/80",
            "[&>button>svg]:size-5",
          )}
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img src={src} alt={alt} className="max-h-[85vh] w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

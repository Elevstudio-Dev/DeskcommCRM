import type { CorDeMarcador } from "@/lib/schemas/settings";

/**
 * A COR DE UM MARCADOR, EM CLASSES — nunca em hex inline.
 *
 * ## Por que um mapa e não `bg-${cor}-500`
 *
 * O Tailwind faz purge em cima do TEXTO do arquivo. Uma classe montada por
 * interpolação não existe para ele: `bg-red-500` some do CSS gerado e o chip sai
 * transparente em produção, com tudo verde no desenvolvimento (onde o JIT vê o
 * arquivo inteiro). É um dos jeitos mais comuns de quebrar cor no Tailwind, e
 * ele quebra só depois do build.
 *
 * ## Por que cada cor tem TRÊS peças
 *
 * `fundo` e `texto` andam juntos por definição — cor de fundo sem cor de texto
 * casada é ilegível em um dos dois temas. `ponto` existe separado porque o
 * seletor de filtro mostra só a bolinha, sem o chip; usar o `fundo` ali daria
 * uma bolinha pálida que não se distingue da vizinha.
 *
 * ## Por que `/15` e `/25` e não a cor cheia
 *
 * O chip fica dentro de listas densas, ao lado do nome do contato e da última
 * mensagem. Cor cheia competiria com a informação; a versão lavada marca a
 * categoria sem roubar a leitura. É a mesma razão pela qual o WhatsApp não
 * pinta a linha inteira de uma conversa arquivada.
 *
 * Os pares foram escolhidos para funcionar nos DOIS temas sem `dark:` em cada
 * um: a transparência sobre o fundo do tema resolve, e o texto usa o degrau
 * claro da rampa, que contrasta com ambos.
 */
export const CLASSE_DE_COR: Record<
  CorDeMarcador,
  { fundo: string; texto: string; ponto: string }
> = {
  cinza: {
    fundo: "bg-zinc-500/15",
    texto: "text-zinc-700 dark:text-zinc-300",
    ponto: "bg-zinc-500",
  },
  vermelho: {
    fundo: "bg-red-500/15",
    texto: "text-red-700 dark:text-red-300",
    ponto: "bg-red-500",
  },
  laranja: {
    fundo: "bg-orange-500/15",
    texto: "text-orange-700 dark:text-orange-300",
    ponto: "bg-orange-500",
  },
  amarelo: {
    fundo: "bg-amber-500/20",
    texto: "text-amber-800 dark:text-amber-300",
    ponto: "bg-amber-500",
  },
  verde: {
    fundo: "bg-emerald-500/15",
    texto: "text-emerald-700 dark:text-emerald-300",
    ponto: "bg-emerald-500",
  },
  azul: {
    fundo: "bg-sky-500/15",
    texto: "text-sky-700 dark:text-sky-300",
    ponto: "bg-sky-500",
  },
  roxo: {
    fundo: "bg-violet-500/15",
    texto: "text-violet-700 dark:text-violet-300",
    ponto: "bg-violet-500",
  },
  rosa: {
    fundo: "bg-pink-500/15",
    texto: "text-pink-700 dark:text-pink-300",
    ponto: "bg-pink-500",
  },
};

/** O rótulo humano de cada cor, para o seletor. */
export const NOME_DA_COR: Record<CorDeMarcador, string> = {
  cinza: "Cinza",
  vermelho: "Vermelho",
  laranja: "Laranja",
  amarelo: "Amarelo",
  verde: "Verde",
  azul: "Azul",
  roxo: "Roxo",
  rosa: "Rosa",
};

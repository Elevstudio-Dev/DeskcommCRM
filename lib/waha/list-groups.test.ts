/**
 * A LISTA DE GRUPOS VEM COMO MAPA — e este arquivo existe porque eu presumi array.
 *
 * ## O defeito, e como ele passou
 *
 * `listGroups` foi escrito a partir da documentação, sem nunca ser exercitado
 * contra o WAHA real. A primeira linha do parser era:
 *
 *     if (!Array.isArray(cru)) return [];
 *
 * O engine NOWEB — o padrão do kit — responde um OBJETO indexado pelo chatId,
 * não um array. Resultado: HTTP 200, zero grupo, nenhum erro, nenhum log. O
 * botão "Importar grupos" dizia que tinha importado e não importava nada. Foi o
 * dono quem viu, na tela dele, com dois grupos reais do outro lado.
 *
 * O pior do desfecho não é o zero: é o 200. Falha que devolve erro alguém
 * conserta; falha que devolve sucesso vazio vira "acho que não tenho grupos".
 *
 * ## O que se mede
 *
 * As DUAS formas, com um payload copiado da resposta real (encurtado, e com os
 * telefones trocados). Medir só o mapa deixaria o array — que é o que a doc
 * mostra e que outro engine pode entregar — sem prova.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

import { WahaClient } from "@/lib/waha/client";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/**
 * Responde ao GET da sessão (para a convergência de config não estourar) e ao
 * GET de grupos com o corpo pedido.
 */
function comResposta(grupos: unknown) {
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    const corpo = u.endsWith("/groups")
      ? grupos
      : // A config JÁ convergida: sem isto, `convergirConfigDaSessao` mandaria
        // um PUT e o teste passaria a medir o transporte em vez do parser.
        { config: { ignore: { status: true, broadcast: true, channels: true, groups: false } } };
    return {
      ok: true,
      status: 200,
      json: async () => corpo,
      text: async () => JSON.stringify(corpo),
    };
  }) as unknown as typeof fetch;
}

/** Recorte do que o NOWEB devolveu de verdade, com os números trocados. */
const MAPA_REAL = {
  "120363401969475450@g.us": {
    id: "120363401969475450@g.us",
    subject: "Elev Studio",
    size: 2,
    participants: [{ id: "36438703866081@lid", phoneNumber: "550000000000@s.whatsapp.net" }],
  },
  "120363410522778104@g.us": {
    id: "120363410522778104@g.us",
    subject: "Fotos tecno",
    size: 2,
  },
};

describe("listGroups", () => {
  it("MAPA indexado por chatId (o que o NOWEB responde de verdade)", async () => {
    comResposta(MAPA_REAL);
    const g = await new WahaClient("http://w", "k").listGroups("s1");
    expect(g).toEqual([
      { chatId: "120363401969475450@g.us", subject: "Elev Studio" },
      { chatId: "120363410522778104@g.us", subject: "Fotos tecno" },
    ]);
  });

  it("array (o que a doc mostra) continua valendo", async () => {
    comResposta([
      { id: "120363401969475450@g.us", subject: "Elev Studio" },
      { id: { _serialized: "120363410522778104@g.us" }, name: "Fotos tecno" },
    ]);
    const g = await new WahaClient("http://w", "k").listGroups("s1");
    expect(g).toEqual([
      { chatId: "120363401969475450@g.us", subject: "Elev Studio" },
      { chatId: "120363410522778104@g.us", subject: "Fotos tecno" },
    ]);
  });

  it("o que não termina em @g.us não entra — nem no mapa, nem no array", async () => {
    // Um contato 1:1 escapando para cá criaria um contato-grupo com identidade
    // de outra coisa, e o índice único não desfaz isso depois.
    comResposta({
      "5511999999999@c.us": { id: "5511999999999@c.us", subject: "Fulano" },
      "120363401969475450@g.us": { id: "120363401969475450@g.us", subject: "Grupo" },
    });
    const g = await new WahaClient("http://w", "k").listGroups("s1");
    expect(g).toEqual([{ chatId: "120363401969475450@g.us", subject: "Grupo" }]);
  });

  it("grupo sem assunto vem com subject null — id é melhor que nome errado", async () => {
    comResposta({ "120363401969475450@g.us": { id: "120363401969475450@g.us" } });
    const g = await new WahaClient("http://w", "k").listGroups("s1");
    expect(g).toEqual([{ chatId: "120363401969475450@g.us", subject: null }]);
  });

  it("corpo que não é objeto nem array devolve lista vazia, sem estourar", async () => {
    comResposta("não sou json de grupo");
    const g = await new WahaClient("http://w", "k").listGroups("s1");
    expect(g).toEqual([]);
  });
});

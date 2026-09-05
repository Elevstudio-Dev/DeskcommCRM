import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONVERSAS_IGNORADAS, WahaClient } from "@/lib/waha/client";

/**
 * O CRM PAGAVA POR CONVERSA QUE ELE MESMO DESCARTA.
 *
 * ─── Medido no banco de produção, 20/08/2026 ────────────────────────────────
 *
 * Todo evento do WAHA é arquivado inteiro. Separando os de mensagem por origem:
 *
 *   estados / difusão ......... 23.010 ... 271 MB
 *   grupos .................... 17.970 .... 89 MB
 *   canais / newsletter ........ 1.818 .... 16 MB
 *   conversa 1-a-1 ............. 4.739 .... 19 MB   ← o negócio
 *
 * 376 dos 395 MB eram conversa que o CRM recebe, grava inteira e joga fora —
 * `handleInbound` já ignora tudo que não é 1-a-1. O gasto acontecia ANTES da
 * decisão: na rede, na CPU do contêiner e no arquivo.
 *
 * ─── Por que a convergência importa mais que a criação ──────────────────────
 *
 * `POST /api/sessions` devolve 422 quando a sessão já existe, e nesse caminho a
 * config NÃO é aplicada. Foi exatamente assim que a sessão de produção ficou
 * sem o filtro: ela nasceu antes desta mudança e nenhum código voltaria para
 * ajustá-la. Sem o PUT, esta economia só valeria para instalação nova.
 */

const fetchOriginal = globalThis.fetch;
let chamadas: { url: string; metodo: string; corpo: unknown }[] = [];

function espionar(respostas: Record<string, number>) {
  globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
    const u = String(url);
    const i = (init ?? {}) as { method?: string; body?: string };
    chamadas.push({ url: u, metodo: i.method ?? "GET", corpo: i.body ? JSON.parse(i.body) : null });
    const status =
      Object.entries(respostas).find(([frag]) => u.includes(frag))?.[1] ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ status: "SCAN_QR_CODE" }),
      text: async () => "",
    };
  }) as unknown as typeof fetch;
}

beforeEach(() => { chamadas = []; });
afterEach(() => { globalThis.fetch = fetchOriginal; });

describe("a sessão nasce ignorando o que o CRM não atende", () => {
  /**
   * ERA "as quatro categorias". VIROU tres, em 2026-09-05, e a mudança é uma
   * DECISÃO DE PRODUTO, não um afrouxamento do filtro.
   *
   * O dono pediu os grupos na tela. A migration 0210 deu identidade própria a
   * eles e `handleInbound` passou a vinculá-los — mas `ignore` do WAHA impede
   * "event processing AND database storage", então enquanto `groups: true`
   * estivesse aqui nenhum código nosso adiantaria: a mensagem nunca chegaria.
   *
   * O custo medido volta junto: 17.970 eventos / 89 MB no levantamento de
   * 20/08/2026. É o preço de ver o grupo, e está escrito para que ninguém o
   * pague por acidente — quem "otimizar" isto de volta apaga um recurso.
   *
   * As outras três continuam valendo e somam 306 dos 395 MB. Elas são o que o
   * CRM continua NÃO atendendo, e por isso continuam pagas a zero.
   */
  it("a criação leva as três categorias que o CRM não atende — e não mais os grupos", async () => {
    espionar({});
    await new WahaClient("http://w", "k").startSession("s1");
    const criacao = chamadas.find((c) => c.url.endsWith("/api/sessions") && c.metodo === "POST");
    expect((criacao?.corpo as { config?: { ignore?: unknown } })?.config?.ignore).toEqual({
      status: true, broadcast: true, channels: true, groups: false,
    });
  });

  it("os estados são a categoria que mais pesava — não podem sair da lista", () => {
    // 271 MB de 395 MB, sozinhos. Se alguém "aliviar" o filtro, é por aqui que
    // o banco volta a crescer 23 MB/dia.
    expect(CONVERSAS_IGNORADAS.status, "os estados voltaram a ser recebidos").toBe(true);
  });

  it("grupo tem de continuar CHEGANDO — o `ignore` do WAHA apaga o recurso na fonte", () => {
    // O contrário das outras três, e por isso tem caso próprio: aqui `true` é o
    // defeito. `ignore` impede processamento E armazenamento no contêiner, então
    // a visão Grupos do inbox ficaria vazia para sempre, sem nenhum erro em log
    // e sem nada na tela dizendo por que. Um "otimizar o filtro" bem
    // intencionado desliga um recurso inteiro daqui.
    expect(
      CONVERSAS_IGNORADAS.groups,
      "os grupos voltaram a ser ignorados no WAHA — a visão Grupos vai ficar vazia calada",
    ).toBe(false);
  });
});

describe("sessão que JÁ existe é corrigida — sem levar a config junto", () => {
  /** Duble que responde ao GET da sessão e registra o que o PUT mandou. */
  function comSessao(configAtual: unknown) {
    const vistos: { metodo: string; corpo: unknown }[] = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      const u = String(url);
      const i2 = (init ?? {}) as { method?: string; body?: string };
      const m = i2.method ?? "GET";
      vistos.push({ metodo: m, corpo: i2.body ? JSON.parse(i2.body) : null });
      if (m === "POST" && u.endsWith("/api/sessions")) {
        return { ok: false, status: 422, json: async () => ({}), text: async () => "" };
      }
      if (m === "GET") {
        return { ok: true, status: 200, json: async () => ({ config: configAtual }), text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => ({ status: "WORKING" }), text: async () => "" };
    }) as unknown as typeof fetch;
    return vistos;
  }

  const WEBHOOKS = [{ url: "https://crm/webhook", events: ["message.any"] }];

  it("o PUT PRESERVA os webhooks — sem isso o canal fica mudo", async () => {
    // A doc do WAHA: o PUT "updates a session with a FULL new configuration".
    // Mandar só `ignore` SUBSTITUI a config e leva o bloco `webhooks` junto —
    // sessão conectada, de pé, sem entregar uma mensagem. A pior forma de
    // falhar, porque nada fica vermelho.
    const vistos = comSessao({ webhooks: WEBHOOKS });
    await new WahaClient("http://w", "k").startSession("s1");
    const put = vistos.find((v) => v.metodo === "PUT");
    const cfg = (put?.corpo as { config?: Record<string, unknown> })?.config;
    expect(cfg?.webhooks, "o PUT apagou os webhooks da sessão").toEqual(WEBHOOKS);
    expect(cfg?.ignore).toEqual(CONVERSAS_IGNORADAS);
  });

  it("não reescreve quando já está como queremos", async () => {
    // Este caminho roda em TODA reconexão, e o PUT REINICIA a sessão. Um
    // restart por rodada seria pior que o gasto que ele evita.
    const vistos = comSessao({ webhooks: WEBHOOKS, ignore: { ...CONVERSAS_IGNORADAS } });
    await new WahaClient("http://w", "k").startSession("s1");
    expect(vistos.some((v) => v.metodo === "PUT"), "reiniciou a sessão à toa").toBe(false);
  });

  it("se não conseguir LER a config, não escreve nada", async () => {
    // Sem saber o que há lá, escrever é apostar o canal inteiro numa economia
    // de bytes.
    const vistos: { metodo: string }[] = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      const m = ((init ?? {}) as { method?: string }).method ?? "GET";
      vistos.push({ metodo: m });
      if (m === "POST" && String(url).endsWith("/api/sessions")) {
        return { ok: false, status: 422, json: async () => ({}), text: async () => "" };
      }
      if (m === "GET") return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
      return { ok: true, status: 200, json: async () => ({ status: "WORKING" }), text: async () => "" };
    }) as unknown as typeof fetch;
    await new WahaClient("http://w", "k").startSession("s1");
    expect(vistos.some((v) => v.metodo === "PUT"), "escreveu às cegas").toBe(false);
  });

  it("falha da convergência não impede a sessão de iniciar", async () => {
    // É economia, não condição de envio.
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      const m = ((init ?? {}) as { method?: string }).method ?? "GET";
      if (m === "GET") throw new Error("ECONNRESET");
      if (m === "POST" && String(url).endsWith("/api/sessions")) {
        return { ok: false, status: 422, json: async () => ({}), text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => ({ status: "WORKING" }), text: async () => "" };
    }) as unknown as typeof fetch;
    await expect(new WahaClient("http://w", "k").startSession("s1")).resolves.toBeTruthy();
  });
});

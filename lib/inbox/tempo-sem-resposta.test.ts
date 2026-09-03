import { describe, expect, it } from "vitest";

import { tempoSemResposta, PISO_MINUTOS } from "@/lib/inbox/tempo-sem-resposta";

const AGORA = new Date("2026-09-03T12:00:00Z");
const base = {
  lastInboundAt: "2026-09-03T11:40:00Z",
  lastOutboundAt: null,
  status: "open",
  agora: AGORA,
  limiteMinutos: 15,
};

describe("tempoSemResposta", () => {
  it("conta os minutos desde a ultima mensagem do cliente", () => {
    expect(tempoSemResposta(base)?.minutos).toBe(20);
  });

  it("conversa fechada nao mostra contador", () => {
    // Ninguem esta esperando. Um contador correndo aqui seria alarme falso
    // permanente em toda conversa encerrada da lista.
    expect(tempoSemResposta({ ...base, status: "closed" })).toBeNull();
    expect(tempoSemResposta({ ...base, status: "archived" })).toBeNull();
  });

  it("cliente que nunca escreveu nao tem espera para contar", () => {
    expect(tempoSemResposta({ ...base, lastInboundAt: null })).toBeNull();
  });

  it("quando o atendente ja respondeu, a bola esta com o cliente", () => {
    // ESTE e o caso que separa "tempo desde a mensagem do CLIENTE" de "tempo
    // desde a ultima mensagem". Sem ele, o contador correria enquanto o
    // cliente e que esta devendo resposta.
    expect(
      tempoSemResposta({ ...base, lastOutboundAt: "2026-09-03T11:45:00Z" }),
    ).toBeNull();
  });

  it("limite ausente cai no piso, e nao some da tela", () => {
    const r = tempoSemResposta({ ...base, limiteMinutos: 0 });
    expect(r).not.toBeNull();
    expect(r?.minutos).toBe(20);
  });

  it("as faixas derivam do limite, nao sao fixas", () => {
    // Com limite 60, o terco e 20 — quem configurou 60 nao deve herdar a
    // regua de quem ficou nos 15.
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T11:50:00Z", limiteMinutos: 60 })
        ?.faixa,
    ).toBe("ok");
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T11:20:00Z", limiteMinutos: 60 })
        ?.faixa,
    ).toBe("atencao");
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T10:30:00Z", limiteMinutos: 60 })
        ?.faixa,
    ).toBe("estourado");
  });

  it("exatamente NO limite ainda e atencao, nao estourado", () => {
    // A fronteira, nao o meio da faixa: e onde erro de comparacao mora.
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T11:45:00Z", limiteMinutos: 15 })
        ?.faixa,
    ).toBe("atencao");
  });

  it("o piso e 15", () => {
    expect(PISO_MINUTOS).toBe(15);
  });
});

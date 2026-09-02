import { describe, expect, it } from "vitest";

import {
  previsaoPonderada,
  type NegocioParaPrevisao,
} from "@/lib/leads/previsao-ponderada";

const negocio = (p: Partial<NegocioParaPrevisao> = {}): NegocioParaPrevisao => ({
  value_cents: 100_00,
  commit_probability_pct: 50,
  status: "open",
  ...p,
});

describe("previsaoPonderada", () => {
  it("funil vazio devolve zeros, nao NaN", () => {
    expect(previsaoPonderada([])).toEqual({
      ponderadoCents: 0,
      brutoCents: 0,
      considerados: 0,
      semAposta: 0,
      semValor: 0,
    });
  });

  it("pondera valor pela aposta do vendedor", () => {
    const r = previsaoPonderada([
      negocio({ value_cents: 1_000_00, commit_probability_pct: 30 }),
      negocio({ value_cents: 500_00, commit_probability_pct: 80 }),
    ]);
    expect(r.ponderadoCents).toBe(300_00 + 400_00);
    expect(r.brutoCents).toBe(1_500_00);
    expect(r.considerados).toBe(2);
  });

  it("negocio sem aposta NAO entra no total e volta contado", () => {
    // POR QUE ESTE TESTE EXISTE: tratar null como 0% e somar mesmo assim daria
    // o mesmo `ponderadoCents` deste caso — e nada acusaria. O que separa as
    // duas implementacoes e `semAposta`, e e por isso que ele existe no retorno.
    const r = previsaoPonderada([
      negocio({ value_cents: 1_000_00, commit_probability_pct: 40 }),
      negocio({ value_cents: 9_999_00, commit_probability_pct: null }),
    ]);
    expect(r.ponderadoCents).toBe(400_00);
    expect(r.brutoCents).toBe(1_000_00);
    expect(r.considerados).toBe(1);
    expect(r.semAposta).toBe(1);
  });

  it("0% e diferente de null: quem digitou zero opinou, e entra", () => {
    const r = previsaoPonderada([
      negocio({ value_cents: 5_000_00, commit_probability_pct: 0 }),
    ]);
    expect(r.ponderadoCents).toBe(0);
    expect(r.considerados).toBe(1);
    expect(r.semAposta).toBe(0);
    expect(r.brutoCents).toBe(5_000_00);
  });

  it("negocio sem valor nao da para ponderar, e volta contado", () => {
    const r = previsaoPonderada([
      negocio({ value_cents: null, commit_probability_pct: 70 }),
    ]);
    expect(r.considerados).toBe(0);
    expect(r.semValor).toBe(1);
    expect(r.ponderadoCents).toBe(0);
  });

  it("negocio sem valor E sem aposta nao conta em lugar nenhum", () => {
    const r = previsaoPonderada([
      negocio({ value_cents: null, commit_probability_pct: null }),
    ]);
    expect(r).toEqual({
      ponderadoCents: 0,
      brutoCents: 0,
      considerados: 0,
      semAposta: 0,
      semValor: 0,
    });
  });

  it("won e lost ficam de fora — previsao nao soma o que ja aconteceu", () => {
    const r = previsaoPonderada([
      negocio({ status: "won", value_cents: 1_000_00, commit_probability_pct: 100 }),
      negocio({ status: "lost", value_cents: 1_000_00, commit_probability_pct: 90 }),
      negocio({ status: "open", value_cents: 200_00, commit_probability_pct: 50 }),
    ]);
    expect(r.ponderadoCents).toBe(100_00);
    expect(r.considerados).toBe(1);
  });

  it("arredonda POR NEGOCIO para a coluna fechar com o rodape", () => {
    // 33 centavos a 33% da 10.89 -> 11 em cada linha. Somar cru e arredondar no
    // fim daria 22 (10.89*2 = 21.78 -> 22); por negocio da 11+11 = 22 tambem,
    // mas com 3 linhas a divergencia aparece: 32.67 -> 33 contra 11*3 = 33.
    // O caso que separa de verdade e o de .5, abaixo.
    const r = previsaoPonderada([
      negocio({ value_cents: 33, commit_probability_pct: 33 }),
      negocio({ value_cents: 33, commit_probability_pct: 33 }),
    ]);
    expect(r.ponderadoCents).toBe(22);
  });

  it("aposta de 100% devolve o valor cheio", () => {
    const r = previsaoPonderada([
      negocio({ value_cents: 1_234_56, commit_probability_pct: 100 }),
    ]);
    expect(r.ponderadoCents).toBe(1_234_56);
    expect(r.brutoCents).toBe(1_234_56);
  });
});

/**
 * CHAT INTERNO — o que é puro sobre canais.
 *
 *  - a chave do par direto é a mesma chame quem chamar primeiro;
 *  - "o outro do par" sabe quem é o outro e recusa quem não está no par;
 *  - não lidas: só as dos outros, depois de onde li — ou das últimas 24h para
 *    quem nunca abriu;
 *  - a ordem da lista: Geral, setores, pessoas por atividade.
 */
import { describe, expect, it } from "vitest";

import { chaveDoParDireto, contarNaoLidas, ordenarCanais, outroDoPar, type CanalDaEquipe } from "@/lib/chat-interno/canais";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

describe("chaveDoParDireto / outroDoPar", () => {
  it("o par é ordenado — Ana→Bia e Bia→Ana são o MESMO canal", () => {
    expect(chaveDoParDireto(A, B)).toBe(chaveDoParDireto(B, A));
    expect(chaveDoParDireto(B, A)).toBe(`${A}:${B}`);
  });

  it("o outro do par é o que não sou eu; quem não está no par recebe null", () => {
    const chave = chaveDoParDireto(A, B);
    expect(outroDoPar(chave, A)).toBe(B);
    expect(outroDoPar(chave, B)).toBe(A);
    expect(outroDoPar(chave, C)).toBeNull();
    expect(outroDoPar("lixo", A)).toBeNull();
  });
});

describe("contarNaoLidas", () => {
  const agora = new Date("2026-09-11T12:00:00Z");
  const msgs = [
    { created_at: "2026-09-11T11:00:00Z", sender_user_id: B }, // 1h atrás, de outro
    { created_at: "2026-09-11T11:30:00Z", sender_user_id: A }, // minha
    { created_at: "2026-09-10T10:00:00Z", sender_user_id: B }, // 26h atrás, de outro
    { created_at: "2026-09-11T11:45:00Z", sender_user_id: null }, // sistema/apagado
  ];

  it("com last_read_at: as de outros depois dele", () => {
    expect(contarNaoLidas(msgs, A, "2026-09-11T11:15:00Z", agora)).toBe(1); // só a de 11:45
    expect(contarNaoLidas(msgs, A, "2026-09-10T00:00:00Z", agora)).toBe(3);
  });

  it("nunca abriu: as de outros das últimas 24h", () => {
    expect(contarNaoLidas(msgs, A, null, agora)).toBe(2); // 11:00 e 11:45; a de ontem 10:00 fica fora
  });

  it("as minhas nunca contam", () => {
    expect(contarNaoLidas([{ created_at: "2026-09-11T11:59:00Z", sender_user_id: A }], A, null, agora)).toBe(0);
  });
});

describe("ordenarCanais", () => {
  const canal = (p: Partial<CanalDaEquipe> & Pick<CanalDaEquipe, "id" | "kind" | "name">): CanalDaEquipe => ({
    sector_id: null,
    sector_color: null,
    other_user_id: null,
    unread: 0,
    last_message: null,
    ...p,
  });

  it("Geral primeiro, setores por nome, pessoas pela conversa mais recente", () => {
    const ordem = ordenarCanais([
      canal({ id: "p2", kind: "direto", name: "Zé", last_message: { body: "x", sender_name: null, created_at: "2026-09-11T10:00:00Z" } }),
      canal({ id: "s2", kind: "setor", name: "Financeiro" }),
      canal({ id: "p1", kind: "direto", name: "Ana", last_message: { body: "x", sender_name: null, created_at: "2026-09-11T09:00:00Z" } }),
      canal({ id: "g", kind: "geral", name: "Geral" }),
      canal({ id: "s1", kind: "setor", name: "Assistência" }),
      canal({ id: "p3", kind: "direto", name: "Bia" }),
    ]).map((c) => c.id);
    expect(ordem).toEqual(["g", "s1", "s2", "p2", "p1", "p3"]);
  });
});

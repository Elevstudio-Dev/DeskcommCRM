import { describe, expect, it } from "vitest";
import { mergeThreadItems } from "@/components/inbox/ChatThread";

describe("mergeThreadItems", () => {
  it("intercala mensagens e notas por tempo", () => {
    const msgs = [
      { id: "m1", sent_at: "2026-07-23T10:00:00Z" },
      { id: "m2", sent_at: "2026-07-23T10:02:00Z" },
    ] as never;
    const notes = [{ id: "n1", created_at: "2026-07-23T10:01:00Z" }] as never;
    const out = mergeThreadItems(msgs, notes);
    expect(out.map((i) => i.data.id)).toEqual(["m1", "n1", "m2"]);
    expect(out[1]!.kind).toBe("note");
  });

  it("sem notas → só mensagens", () => {
    const msgs = [{ id: "m1", sent_at: "2026-07-23T10:00:00Z" }] as never;
    expect(mergeThreadItems(msgs, []).every((i) => i.kind === "message")).toBe(true);
  });

  it("empate de timestamp mantém ordem estável (mensagem antes da nota)", () => {
    const msgs = [{ id: "m1", sent_at: "2026-07-23T10:00:00Z" }] as never;
    const notes = [{ id: "n1", created_at: "2026-07-23T10:00:00Z" }] as never;
    const out = mergeThreadItems(msgs, notes);
    expect(out.map((i) => i.data.id)).toEqual(["m1", "n1"]);
  });

  /**
   * A TERCEIRA FONTE (2026-09-05): quem assumiu, largou ou transferiu.
   *
   * Entra na MESMA linha do tempo, e não numa seção ao lado, porque "Fulano
   * assumiu" só significa alguma coisa no ponto do histórico em que aconteceu —
   * numa lista separada, a pessoa teria de cruzar horários de cabeça para saber
   * o que veio antes da troca de dono.
   *
   * O parâmetro é OPCIONAL (`= []`) de propósito: os quatro casos acima foram
   * escritos antes desta fonte existir e continuam valendo byte a byte. Se ele
   * fosse obrigatório, o typecheck cobraria a mudança em todos eles e a
   * diferença entre "o que mudou" e "o que só foi tocado" se perderia.
   */
  it("intercala o evento de responsável entre as mensagens, pelo tempo", () => {
    const msgs = [
      { id: "m1", sent_at: "2026-07-23T10:00:00Z" },
      { id: "m2", sent_at: "2026-07-23T10:10:00Z" },
    ] as never;
    const eventos = [
      { id: "e1", reason: "claim", created_at: "2026-07-23T10:05:00Z" },
    ] as never;
    const out = mergeThreadItems(msgs, [] as never, eventos);
    expect(out.map((i) => i.kind)).toEqual(["message", "responsavel", "message"]);
    expect(out.map((i) => i.data.id)).toEqual(["m1", "e1", "m2"]);
  });

  it("sem eventos, o resultado é exatamente o de antes — o parâmetro é opcional", () => {
    const msgs = [{ id: "m1", sent_at: "2026-07-23T10:00:00Z" }] as never;
    expect(mergeThreadItems(msgs, [] as never)).toEqual(
      mergeThreadItems(msgs, [] as never, [] as never),
    );
  });

  it("array vazio de ambos retorna vazio", () => {
    expect(mergeThreadItems([], [])).toEqual([]);
  });
});

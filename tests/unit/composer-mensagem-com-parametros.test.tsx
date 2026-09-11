/**
 * A JANELINHA DE PARÂMETROS, vista pelo composer.
 *
 * O que estes casos prendem:
 *
 *  - mensagem sem parâmetro livre e com os automáticos resolvidos entra DIRETO
 *    no campo (como sempre entrou) — a janelinha não pode virar um clique a
 *    mais para quem só queria "Oi {{primeiro_nome}}";
 *  - mensagem com parâmetro livre abre a janelinha, com o automático já
 *    preenchido e o livre vazio, e "Usar mensagem" só destrava quando o livre
 *    tem valor;
 *  - o que entra no campo é o texto pronto — e o envio continua sendo o botão
 *    de sempre (nada sai daqui sozinho);
 *  - o botão ⚡ abre o menu sem o campo estar vazio e sem saber o `/`.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const TEMPLATES = [
  { id: "t1", title: "Saudação", body: "Oi {{primeiro_nome}}, aqui é {{atendente}}.", shortcut: "oi", owner_user_id: null },
  {
    id: "t2",
    title: "Pedido saiu",
    body: "{{nome}}, seu pedido {{numero_pedido}} saiu hoje. — {{atendente}}",
    shortcut: "saiu",
    owner_user_id: null,
  },
];

vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: TEMPLATES, isLoading: false }),
}));
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { Composer } from "@/components/inbox/Composer";

function renderComposer(props: { contactName?: string | null; attendantName?: string | null } = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Composer
        conversationId="conv-1"
        contactName={props.contactName === undefined ? "Ana Paula Souza" : props.contactName}
        attendantName={props.attendantName === undefined ? "Carlos" : props.attendantName}
      />
    </QueryClientProvider>,
  );
}

const campo = () => screen.getByLabelText(/^mensagem$/i) as HTMLTextAreaElement;

beforeEach(() => sendMock.mockClear());

describe("mensagem pronta sem nada a perguntar", () => {
  it("entra direto no campo, preenchida, sem abrir a janelinha", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    fireEvent.click(screen.getByText("Saudação"));

    expect(campo().value).toBe("Oi Ana, aqui é Carlos.");
    expect(screen.queryByRole("dialog")).toBeNull();
    // E NADA foi enviado: inserir não é mandar.
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("mensagem pronta com parâmetro livre", () => {
  it("abre a janelinha com o automático preenchido e o livre vazio", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    fireEvent.click(screen.getByText("Pedido saiu"));

    const janela = screen.getByRole("dialog");
    expect(within(janela).getByRole("heading", { name: "Pedido saiu" })).toBeTruthy();
    expect((within(janela).getByLabelText(/nome do cliente/i) as HTMLInputElement).value).toBe("Ana Paula Souza");
    expect((within(janela).getByLabelText(/nome do atendente/i) as HTMLInputElement).value).toBe("Carlos");
    expect((within(janela).getByLabelText(/numero pedido/i) as HTMLInputElement).value).toBe("");
    // O campo do composer continua vazio: nada entrou antes da decisão.
    expect(campo().value).toBe("");
  });

  it("'Usar mensagem' fica travado até o livre ter valor, e a prévia acompanha", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    fireEvent.click(screen.getByText("Pedido saiu"));
    const janela = screen.getByRole("dialog");
    const usar = within(janela).getByRole("button", { name: /usar mensagem/i });

    expect(usar).toBeDisabled();
    expect(within(janela).getByTestId("previa-da-mensagem").textContent).toContain("{{numero_pedido}}");

    fireEvent.change(within(janela).getByLabelText(/numero pedido/i), { target: { value: "4521" } });
    expect(usar).not.toBeDisabled();
    expect(within(janela).getByTestId("previa-da-mensagem").textContent).toBe(
      "Ana Paula Souza, seu pedido 4521 saiu hoje. — Carlos",
    );
  });

  it("'Usar mensagem' põe o texto pronto no campo — e não envia", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    fireEvent.click(screen.getByText("Pedido saiu"));
    const janela = screen.getByRole("dialog");
    fireEvent.change(within(janela).getByLabelText(/numero pedido/i), { target: { value: "4521" } });
    fireEvent.click(within(janela).getByRole("button", { name: /usar mensagem/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(campo().value).toBe("Ana Paula Souza, seu pedido 4521 saiu hoje. — Carlos");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("um automático corrigido na janelinha vale no texto", () => {
    // O nome do cadastro pode estar errado; é aqui que se conserta antes de sair.
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    fireEvent.click(screen.getByText("Pedido saiu"));
    const janela = screen.getByRole("dialog");
    fireEvent.change(within(janela).getByLabelText(/nome do cliente/i), { target: { value: "Dona Ana" } });
    fireEvent.change(within(janela).getByLabelText(/numero pedido/i), { target: { value: "1" } });
    fireEvent.click(within(janela).getByRole("button", { name: /usar mensagem/i }));
    expect(campo().value).toBe("Dona Ana, seu pedido 1 saiu hoje. — Carlos");
  });

  it("cancelar fecha sem tocar no campo", () => {
    renderComposer();
    fireEvent.change(campo(), { target: { value: "rascunho meu" } });
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    fireEvent.click(screen.getByText("Pedido saiu"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancelar/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(campo().value).toBe("rascunho meu");
  });
});

describe("contato sem nome", () => {
  it("até a saudação simples pergunta o nome — antes ia '{{primeiro_nome}}' literal para o cliente", () => {
    renderComposer({ contactName: null });
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    fireEvent.click(screen.getByText("Saudação"));
    const janela = screen.getByRole("dialog");
    expect((within(janela).getByLabelText(/primeiro nome do cliente/i) as HTMLInputElement).value).toBe("");
    expect(within(janela).getByRole("button", { name: /usar mensagem/i })).toBeDisabled();
  });
});

describe("o botão ⚡", () => {
  it("abre o menu mesmo com texto no campo, e o `/` continua funcionando", () => {
    renderComposer();
    fireEvent.change(campo(), { target: { value: "já estava escrevendo" } });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    // Clicar de novo fecha.
    fireEvent.click(screen.getByRole("button", { name: /mensagens prontas/i }));
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.change(campo(), { target: { value: "/sai" } });
    expect(within(screen.getByRole("listbox")).getByText("Pedido saiu")).toBeTruthy();
  });
});

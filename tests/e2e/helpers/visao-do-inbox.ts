/**
 * As visões do inbox (Fila / Minhas / Todas / Automático / Arquivadas) deixaram
 * de ser ABAS e viraram um MENU (2026-09-04, a pedido do dono: a fileira de abas
 * competia com a lista de conversas por espaço horizontal).
 *
 * Isso muda o gesto das specs: item de menu fechado não existe no DOM. Duas
 * consequências que este helper existe para evitar:
 *
 *  1. um `toHaveCount(0)` sem abrir o menu passa por VACUIDADE — não acha nada
 *     porque não há nada, e aprova uma tela que poderia estar quebrada;
 *  2. menu aberto é um overlay que engole o próximo clique da spec.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** O gatilho. Mostra a visão ATUAL e a contagem dela, sem abrir nada. */
export function visaoAtualDoInbox(page: Page): Locator {
  return page.getByTestId("visao-do-inbox");
}

/** Troca de visão: abre o menu e escolhe. O menu fecha sozinho ao escolher. */
export async function escolherVisaoDoInbox(page: Page, nome: RegExp): Promise<void> {
  await visaoAtualDoInbox(page).click();
  await page.getByRole("menuitem", { name: nome }).first().click();
}

/**
 * Para specs que precisam LER o menu (o que aparece e o que não aparece).
 * Abre, confere que abriu mesmo — a guarda contra o passe por vacuidade — e
 * fecha sempre, inclusive quando `olhar` reprova.
 */
export async function comAsVisoesAbertas(page: Page, olhar: () => Promise<void>): Promise<void> {
  await visaoAtualDoInbox(page).click();
  await expect(
    page.getByRole("menuitem", { name: /Fila/ }),
    "o menu de visões não abriu — sem isso, toda ausência abaixo passaria por vacuidade",
  ).toBeVisible({ timeout: 15_000 });
  try {
    await olhar();
  } finally {
    await page.keyboard.press("Escape");
  }
}

/**
 * Abre o menu "Opções" do topo da conversa e devolve o item pedido.
 *
 * Devolver-ao-automatico, pausar-o-automatico, transferir, lembrar e arquivar
 * saíram da fileira de botões e viraram itens deste menu (2026-09-04) — só
 * **Assumir/Liberar** ficou à vista, porque é a ação do dia a dia. O que as
 * specs medem não mudou: a ação existe e funciona. O que mudou é que agora
 * custa um clique a mais chegar nela.
 */
export async function acaoDaConversa(page: Page, testid: string): Promise<Locator> {
  await page.getByTestId("opcoes-da-conversa").click();
  return page.getByTestId(testid);
}

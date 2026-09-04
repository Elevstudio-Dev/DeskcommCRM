"use server";

/**
 * Server Action: a pessoa escolhe por onde começar.
 *
 * Grava `onboarding_state.caminho`. Quem decide o que isso muda é
 * `lib/onboarding/passos.ts` — aqui só se registra a resposta.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { CAMINHOS_DO_ONBOARDING } from "@/lib/schemas/onboarding";
import { requireOnboardingCtx, patchOnboardingState, OnboardingError } from "./_shared";

const entrada = z.object({ caminho: z.enum(CAMINHOS_DO_ONBOARDING) });

export type EscolherCaminhoResult =
  | { ok: true }
  | {
      ok: false;
      error: "auth_required" | "no_active_org" | "invalid_input" | "db_error";
      details?: unknown;
    };

export async function escolherCaminho(formData: FormData): Promise<EscolherCaminhoResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code as never };
    throw err;
  }

  let input;
  try {
    input = entrada.parse({ caminho: String(formData.get("caminho") ?? "") });
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: "invalid_input", details: err.flatten() };
    throw err;
  }

  try {
    await patchOnboardingState(ctx.orgId, { caminho: input.caminho });
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: "db_error", details: err.message };
    throw err;
  }

  // O indicador de progresso vive no layout do wizard, e a escolha MUDA quantos
  // passos ele desenha. Sem invalidar, a pessoa seguiria vendo a régua do
  // caminho que não escolheu até um recarregamento completo — o mesmo defeito
  // que o `acceptWelcome` documenta com o nome do negócio.
  revalidatePath("/onboarding", "layout");

  await audit({
    action: "onboarding.caminho_escolhido",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "organization",
    resourceId: ctx.orgId,
    metadata: { caminho: input.caminho },
  });

  redirect("/onboarding");
}

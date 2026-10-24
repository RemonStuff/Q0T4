import type { ModelPort } from "../../ports/ModelPort";
import type { ModelSelectorPort } from "../../ports/ModelSelectorPort";

export type ModelResolution =
  { readonly kind: "ok"; readonly model: ModelPort } | { readonly kind: "noModel" };

export async function resolveModel(
  requestModel: ModelPort,
  selector: ModelSelectorPort,
  availability: "available" | "unavailable" = "available",
): Promise<ModelResolution> {
  if (availability === "available") return { kind: "ok", model: requestModel };

  const models = await selector.select({ vendor: "copilot" });
  const model = models.find((candidate) => candidate.family === requestModel.family) ?? models[0];
  return model ? { kind: "ok", model } : { kind: "noModel" };
}

/**
 * The model to retry with after `failed` was not found: another Copilot model,
 * preferably of the same family. Never the one that just failed.
 */
export async function findFallbackModel(
  failed: ModelPort,
  selector: ModelSelectorPort,
): Promise<ModelPort | undefined> {
  const models = (await selector.select({ vendor: "copilot" })).filter(
    (candidate) => candidate.id !== failed.id,
  );
  return models.find((candidate) => candidate.family === failed.family) ?? models[0];
}

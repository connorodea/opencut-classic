/**
 * Shared helper for headless grading-effect state-persistence proofs
 * (primary-wheels-proof.ts, log-wheels-proof.ts, and future grading
 * subsystems in Goal 4b). Extracted after the second copy of this exact
 * pattern — see COLOR_GRADING_DESIGN.md's "state persistence != visual
 * correctness" note for why this only proves the Action/state layer, not
 * rendered output (that's each subsystem's own native-GPU pixel test).
 */
import { EditorCore } from "@/core";
import { ACTION_HANDLERS } from "@/actions/handlers";
import { buildTextElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import type { Effect } from "@/effects/types";

export function getEffects(element: unknown): Effect[] {
	if (
		typeof element === "object" &&
		element !== null &&
		"effects" in element &&
		Array.isArray((element as { effects?: unknown }).effects)
	) {
		return (element as { effects: Effect[] }).effects;
	}
	return [];
}

export async function proveGradingEffectPersistence({
	projectName,
	effectType,
	params,
}: {
	projectName: string;
	effectType: string;
	params: Record<string, number | string | boolean>;
}): Promise<void> {
	const editor = EditorCore.getInstance();

	const projectId = await editor.project.createNewProject({
		name: projectName,
	});
	console.log("[ok] created project:", projectId);

	const element = buildTextElement({
		raw: { name: "Test clip" },
		startTime: mediaTimeFromSeconds({ seconds: 0 }),
	});

	editor.timeline.insertElement({
		element,
		placement: { mode: "auto", trackType: "text" },
	});

	const sceneAfterInsert = editor.scenes.getActiveSceneOrNull();
	const insertedElement = sceneAfterInsert?.tracks.overlay
		.flatMap((track) => track.elements.map((el) => ({ trackId: track.id, el })))
		.find(({ el }) => el.name === "Test clip");

	if (!insertedElement) {
		throw new Error("FAIL: inserted text element not found in scene state");
	}
	const { trackId, el: timelineElement } = insertedElement;
	console.log("[ok] inserted element:", timelineElement.id, "on track", trackId);

	ACTION_HANDLERS["add-clip-effect"](editor, {
		trackId,
		elementId: timelineElement.id,
		effectType,
	} as never);

	const sceneAfterEffect = editor.scenes.getActiveSceneOrNull();
	const effectId = getEffects(
		sceneAfterEffect?.tracks.overlay
			.find((t) => t.id === trackId)
			?.elements.find((el) => el.id === timelineElement.id),
	)[0]?.id;

	if (!effectId) {
		throw new Error(`FAIL: ${effectType} effect not found after add-clip-effect`);
	}
	console.log(`[ok] added ${effectType} effect:`, effectId);

	ACTION_HANDLERS["update-clip-effect-params"](editor, {
		trackId,
		elementId: timelineElement.id,
		effectId,
		params,
	} as never);

	await editor.project.saveCurrentProject();
	console.log("[ok] saved project");

	EditorCore.reset();
	const editor2 = EditorCore.getInstance();
	await editor2.project.loadProject({ id: projectId });

	const reloadedScene = editor2.scenes.getActiveSceneOrNull();
	const reloadedEffect = getEffects(
		reloadedScene?.tracks.overlay
			.find((t) => t.id === trackId)
			?.elements.find((el) => el.id === timelineElement.id),
	).find((e) => e.id === effectId);

	if (!reloadedEffect) {
		throw new Error(`FAIL: ${effectType} effect did not survive save+reload`);
	}

	const typeMatches = reloadedEffect.type === effectType;
	const paramsMatch = Object.entries(params).every(
		([key, value]) => reloadedEffect.params[key] === value,
	);
	const allMatch = typeMatches && paramsMatch;

	console.log(
		allMatch ? "[ok]" : "[FAIL]",
		"effect type + all params persisted through save+reload:",
		JSON.stringify(reloadedEffect.params),
	);

	if (!allMatch) {
		process.exit(1);
	}
}

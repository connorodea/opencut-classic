import type { ShortcutKey } from "@/actions/keybinding";
import type { TActionWithOptionalArgs } from "./types";

export type TActionCategory =
	| "playback"
	| "navigation"
	| "editing"
	| "selection"
	| "history"
	| "timeline"
	| "controls"
	| "assets"
	| "project"
	| "effects"
	| "keyframes"
	| "masks"
	| "scenes"
	| "tracks";

export interface TActionBaseDefinition {
	description: string;
	category: TActionCategory;
	args?: Record<string, unknown>;
}

export interface TActionDefinition extends TActionBaseDefinition {
	defaultShortcuts?: readonly ShortcutKey[];
}

export const ACTIONS = {
	"toggle-play": {
		description: "Play/Pause",
		category: "playback",
	},
	"stop-playback": {
		description: "Stop playback",
		category: "playback",
	},
	"seek-forward": {
		description: "Seek forward 1 second",
		category: "playback",
		args: { seconds: "number" },
	},
	"seek-backward": {
		description: "Seek backward 1 second",
		category: "playback",
		args: { seconds: "number" },
	},
	"frame-step-forward": {
		description: "Frame step forward",
		category: "navigation",
	},
	"frame-step-backward": {
		description: "Frame step backward",
		category: "navigation",
	},
	"jump-forward": {
		description: "Jump forward 5 seconds",
		category: "navigation",
		args: { seconds: "number" },
	},
	"jump-backward": {
		description: "Jump backward 5 seconds",
		category: "navigation",
		args: { seconds: "number" },
	},
	"goto-start": {
		description: "Go to timeline start",
		category: "navigation",
	},
	"goto-end": {
		description: "Go to timeline end",
		category: "navigation",
	},
	split: {
		description: "Split elements at playhead",
		category: "editing",
	},
	"split-left": {
		description: "Split and remove left",
		category: "editing",
	},
	"split-right": {
		description: "Split and remove right",
		category: "editing",
	},
	"delete-selected": {
		description: "Delete current selection",
		category: "editing",
	},
	"copy-selected": {
		description: "Copy selected elements",
		category: "editing",
	},
	"paste-copied": {
		description: "Paste elements at playhead",
		category: "editing",
	},
	"toggle-snapping": {
		description: "Toggle snapping",
		category: "editing",
	},
	"toggle-ripple-editing": {
		description: "Toggle ripple editing",
		category: "editing",
	},
	"toggle-source-audio": {
		description: "Extract or recover source audio",
		category: "editing",
	},
	"select-all": {
		description: "Select all elements",
		category: "selection",
	},
	"cancel-interaction": {
		description: "Cancel current interaction",
		category: "controls",
	},
	"deselect-all": {
		description: "Deselect all elements",
		category: "selection",
	},
	"duplicate-selected": {
		description: "Duplicate selected element",
		category: "selection",
	},
	"toggle-elements-muted-selected": {
		description: "Mute/unmute selected elements",
		category: "selection",
	},
	"toggle-elements-visibility-selected": {
		description: "Show/hide selected elements",
		category: "selection",
	},
	"toggle-bookmark": {
		description: "Toggle bookmark at playhead",
		category: "timeline",
	},
	undo: {
		description: "Undo",
		category: "history",
	},
	redo: {
		description: "Redo",
		category: "history",
	},
	"remove-media-asset": {
		description: "Remove media asset",
		category: "assets",
		args: { projectId: "string", assetId: "string" },
	},
	"remove-media-assets": {
		description: "Remove media assets",
		category: "assets",
		args: { projectId: "string", assetIds: "string[]" },
	},
	"export-project": {
		description: "Render and export the active project to a video file",
		category: "project",
		args: {
			format: "string",
			quality: "string",
			fps: "number",
			includeAudio: "boolean",
		},
	},
	"create-project": {
		description: "Create a new project and make it active",
		category: "project",
		args: { name: "string" },
	},
	"load-project": {
		description: "Load an existing project by id and make it active",
		category: "project",
		args: { id: "string" },
	},
	"save-project": {
		description: "Save the active project",
		category: "project",
	},
	"update-project-settings": {
		description: "Update the active project's settings (fps, canvas size, background, etc.)",
		category: "project",
		args: { settings: "object" },
	},
	"add-clip-effect": {
		description: "Add an effect to a clip",
		category: "effects",
		args: { trackId: "string", elementId: "string", effectType: "string" },
	},
	"remove-clip-effect": {
		description: "Remove an effect from a clip",
		category: "effects",
		args: { trackId: "string", elementId: "string", effectId: "string" },
	},
	"toggle-clip-effect": {
		description: "Enable/disable an effect on a clip",
		category: "effects",
		args: { trackId: "string", elementId: "string", effectId: "string" },
	},
	"reorder-clip-effects": {
		description: "Change the order of an effect in a clip's effect stack",
		category: "effects",
		args: {
			trackId: "string",
			elementId: "string",
			fromIndex: "number",
			toIndex: "number",
		},
	},
	"update-clip-effect-params": {
		description: "Update an effect's parameter values on a clip",
		category: "effects",
		args: {
			trackId: "string",
			elementId: "string",
			effectId: "string",
			params: "object",
		},
	},
	"upsert-keyframe": {
		description: "Create or update a keyframe on an animated element property",
		category: "keyframes",
		args: {
			trackId: "string",
			elementId: "string",
			propertyPath: "string",
			time: "number",
			value: "unknown",
			interpolation: "string",
			keyframeId: "string",
		},
	},
	"retime-keyframe": {
		description: "Move a keyframe to a new time",
		category: "keyframes",
		args: {
			trackId: "string",
			elementId: "string",
			propertyPath: "string",
			keyframeId: "string",
			time: "number",
		},
	},
	"update-keyframe-curve": {
		description: "Update a keyframe's easing/curve on a scalar animated property",
		category: "keyframes",
		args: {
			trackId: "string",
			elementId: "string",
			propertyPath: "string",
			componentKey: "string",
			keyframeId: "string",
			patch: "object",
		},
	},
	"upsert-effect-param-keyframe": {
		description: "Create or update a keyframe on an effect's parameter",
		category: "keyframes",
		args: {
			trackId: "string",
			elementId: "string",
			effectId: "string",
			paramKey: "string",
			time: "number",
			value: "number",
			interpolation: "string",
			keyframeId: "string",
		},
	},
	"remove-effect-param-keyframe": {
		description: "Remove a keyframe from an effect's parameter",
		category: "keyframes",
		args: {
			trackId: "string",
			elementId: "string",
			effectId: "string",
			paramKey: "string",
			keyframeId: "string",
		},
	},
	"remove-mask": {
		description: "Remove a mask from a clip",
		category: "masks",
		args: { trackId: "string", elementId: "string", maskId: "string" },
	},
	"toggle-mask-inverted": {
		description: "Invert/uninvert a clip's mask",
		category: "masks",
		args: { trackId: "string", elementId: "string", maskId: "string" },
	},
	"insert-freeform-path-mask-point": {
		description: "Insert a point into a clip's freeform-path mask",
		category: "masks",
		args: {
			trackId: "string",
			elementId: "string",
			maskId: "string",
			segmentIndex: "number",
			canvasPoint: "object",
			bounds: "object",
		},
	},
	"create-scene": {
		description: "Create a new scene in the active project",
		category: "scenes",
		args: { name: "string", isMain: "boolean" },
	},
	"delete-scene": {
		description: "Delete a scene from the active project",
		category: "scenes",
		args: { sceneId: "string" },
	},
	"rename-scene": {
		description: "Rename a scene",
		category: "scenes",
		args: { sceneId: "string", name: "string" },
	},
	"switch-scene": {
		description: "Make a scene the active scene",
		category: "scenes",
		args: { sceneId: "string" },
	},
	"remove-bookmark": {
		description: "Remove a bookmark at a given time",
		category: "timeline",
		args: { time: "number" },
	},
	"update-bookmark": {
		description: "Update a bookmark's fields (e.g. label) at a given time",
		category: "timeline",
		args: { time: "number", updates: "object" },
	},
	"move-bookmark": {
		description: "Move a bookmark from one time to another",
		category: "timeline",
		args: { fromTime: "number", toTime: "number" },
	},
	"add-track": {
		description: "Add a new track to the timeline",
		category: "tracks",
		args: { type: "string", index: "number" },
	},
	"remove-track": {
		description: "Remove a track from the timeline",
		category: "tracks",
		args: { trackId: "string" },
	},
	"toggle-track-mute": {
		description: "Mute/unmute a track",
		category: "tracks",
		args: { trackId: "string" },
	},
	"toggle-track-visibility": {
		description: "Show/hide a track",
		category: "tracks",
		args: { trackId: "string" },
	},
} as const satisfies Record<string, TActionBaseDefinition>;

export type TAction = keyof typeof ACTIONS;

const ACTION_DEFAULT_SHORTCUTS = [
	["toggle-play", ["space", "k"]],
	["seek-forward", ["l"]],
	["seek-backward", ["j"]],
	["frame-step-forward", ["right"]],
	["frame-step-backward", ["left"]],
	["jump-forward", ["shift+right"]],
	["jump-backward", ["shift+left"]],
	["goto-start", ["home", "enter"]],
	["goto-end", ["end"]],
	["split", ["s"]],
	["split-left", ["q"]],
	["split-right", ["w"]],
	["delete-selected", ["backspace", "delete"]],
	["copy-selected", ["ctrl+c"]],
	["paste-copied", ["ctrl+v"]],
	["toggle-snapping", ["n"]],
	["select-all", ["ctrl+a"]],
	["cancel-interaction", ["escape"]],
	["duplicate-selected", ["ctrl+d"]],
	["undo", ["ctrl+z"]],
	["redo", ["ctrl+shift+z", "ctrl+y"]],
] as const satisfies ReadonlyArray<
	readonly [TActionWithOptionalArgs, readonly ShortcutKey[]]
>;

const ACTION_DEFAULT_SHORTCUTS_BY_ACTION = new Map<
	TAction,
	readonly ShortcutKey[]
>(ACTION_DEFAULT_SHORTCUTS);

export function getActionDefinition({
	action,
}: {
	action: TAction;
}): TActionDefinition {
	return {
		...ACTIONS[action],
		defaultShortcuts: ACTION_DEFAULT_SHORTCUTS_BY_ACTION.get(action),
	};
}

export function getDefaultShortcuts(): Map<
	ShortcutKey,
	TActionWithOptionalArgs
> {
	const shortcuts = new Map<ShortcutKey, TActionWithOptionalArgs>();

	for (const [action, defaultShortcuts] of ACTION_DEFAULT_SHORTCUTS) {
		for (const shortcut of defaultShortcuts) {
			shortcuts.set(shortcut, action);
		}
	}

	return shortcuts;
}

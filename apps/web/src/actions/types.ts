import type { MutableRefObject } from "react";
import type { FrameRate } from "opencut-wasm";
import type { ExportFormat, ExportQuality } from "@/export";
import type { TProjectSettings } from "@/project/types";
import type { ParamValues, ParamValue } from "@/params";
import type {
	AnimationPath,
	AnimationInterpolation,
	ScalarCurveKeyframePatch,
} from "@/animation/types";
import type { MediaTime } from "@/wasm";
import type { ElementBounds } from "@/preview/element-bounds";
import type { Bookmark, TrackType } from "@/timeline";
import type { TAction } from "./definitions";

export type { TAction };

export type TActionArgsMap = {
	"seek-forward": { seconds: number } | undefined;
	"seek-backward": { seconds: number } | undefined;
	"jump-forward": { seconds: number } | undefined;
	"jump-backward": { seconds: number } | undefined;
	"remove-media-asset": { projectId: string; assetId: string };
	"remove-media-assets": { projectId: string; assetIds: string[] };
	"export-project": {
		format: ExportFormat;
		quality: ExportQuality;
		fps?: FrameRate;
		includeAudio?: boolean;
	};
	"create-project": { name: string };
	"load-project": { id: string };
	"update-project-settings": { settings: Partial<TProjectSettings> };
	"add-clip-effect": {
		trackId: string;
		elementId: string;
		effectType: string;
	};
	"remove-clip-effect": { trackId: string; elementId: string; effectId: string };
	"toggle-clip-effect": { trackId: string; elementId: string; effectId: string };
	"reorder-clip-effects": {
		trackId: string;
		elementId: string;
		fromIndex: number;
		toIndex: number;
	};
	"update-clip-effect-params": {
		trackId: string;
		elementId: string;
		effectId: string;
		params: Partial<ParamValues>;
	};
	"upsert-keyframe": {
		trackId: string;
		elementId: string;
		propertyPath: AnimationPath;
		time: MediaTime;
		value: ParamValue;
		interpolation?: AnimationInterpolation;
		keyframeId?: string;
	};
	"retime-keyframe": {
		trackId: string;
		elementId: string;
		propertyPath: AnimationPath;
		keyframeId: string;
		time: MediaTime;
	};
	"update-keyframe-curve": {
		trackId: string;
		elementId: string;
		propertyPath: AnimationPath;
		componentKey: string;
		keyframeId: string;
		patch: ScalarCurveKeyframePatch;
	};
	"upsert-effect-param-keyframe": {
		trackId: string;
		elementId: string;
		effectId: string;
		paramKey: string;
		time: MediaTime;
		value: number;
		interpolation?: "linear" | "hold";
		keyframeId?: string;
	};
	"remove-effect-param-keyframe": {
		trackId: string;
		elementId: string;
		effectId: string;
		paramKey: string;
		keyframeId: string;
	};
	"remove-mask": { trackId: string; elementId: string; maskId: string };
	"toggle-mask-inverted": { trackId: string; elementId: string; maskId: string };
	"insert-freeform-path-mask-point": {
		trackId: string;
		elementId: string;
		maskId: string;
		segmentIndex: number;
		canvasPoint: { x: number; y: number };
		bounds: ElementBounds;
	};
	"create-scene": { name: string; isMain: boolean };
	"delete-scene": { sceneId: string };
	"rename-scene": { sceneId: string; name: string };
	"switch-scene": { sceneId: string };
	"remove-bookmark": { time: MediaTime };
	"update-bookmark": { time: MediaTime; updates: Partial<Omit<Bookmark, "time">> };
	"move-bookmark": { fromTime: MediaTime; toTime: MediaTime };
	"add-track": { type: TrackType; index?: number };
	"remove-track": { trackId: string };
	"toggle-track-mute": { trackId: string };
	"toggle-track-visibility": { trackId: string };
	"rename-project": { id: string; name: string };
	"duplicate-projects": { ids: string[] };
	"delete-projects": { ids: string[] };
	"update-project-thumbnail": { thumbnail: string };
};

type TKeysWithValueUndefined<T> = {
	[K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

export type TActionWithArgs = keyof TActionArgsMap;

export type TActionWithOptionalArgs =
	| TActionWithNoArgs
	| TKeysWithValueUndefined<TActionArgsMap>;

export type TActionWithNoArgs = Exclude<TAction, TActionWithArgs>;

export type TArgOfAction<A extends TAction> = A extends TActionWithArgs
	? TActionArgsMap[A]
	: undefined;

export type TActionFunc<A extends TAction> = A extends TActionWithArgs
	? (arg: TArgOfAction<A>, trigger?: TInvocationTrigger) => void
	: (_?: undefined, trigger?: TInvocationTrigger) => void;

export type TInvocationTrigger = "keypress" | "mouseclick";

export type TBoundActionList = {
	[A in TAction]?: Array<TActionFunc<A>>;
};

export type TActionHandlerOptions =
	| MutableRefObject<boolean>
	| boolean
	| undefined;

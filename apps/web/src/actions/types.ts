import type { MutableRefObject } from "react";
import type { FrameRate } from "opencut-wasm";
import type { ExportFormat, ExportQuality } from "@/export";
import type { TProjectSettings } from "@/project/types";
import type { ParamValues } from "@/params";
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

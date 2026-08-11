"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
	ScopeHistogram,
	ScopeParade,
	ScopeVectorscope,
	ScopeWaveform,
} from "@/scopes/types";
import { HistogramChart } from "./histogram-chart";
import { ParadeCanvas } from "./parade-canvas";
import { VectorscopeCanvas } from "./vectorscope-canvas";
import { WaveformCanvas } from "./waveform-canvas";

/**
 * The visual scope panel flagged in GOALS.md as "a separate, larger,
 * not-yet-started stretch beyond what Goal 4b's Done-when strictly
 * requires" -- the computation + Action layer (compute_*_from_pixels,
 * the computeHistogram/etc. WASM bindings, @/services/color-scope/service)
 * was already built and verified; this is the display layer on top.
 *
 * Purely presentational -- takes all 4 already-computed scope results as
 * props rather than fetching them itself, so it has no dependency on the
 * not-yet-published @connorodea/opencut-wasm package and can be wired up,
 * tested, and reviewed independently of that publish landing. A thin
 * container that calls computeFrameScope/computeFrameScopeFromImageData
 * and feeds this component is a small addition once the package publishes.
 */
export function ScopePanel({
	histogram,
	waveform,
	vectorscope,
	parade,
}: {
	histogram: ScopeHistogram;
	waveform: ScopeWaveform;
	vectorscope: ScopeVectorscope;
	parade: ScopeParade;
}) {
	return (
		<Tabs defaultValue="histogram" className="flex h-full flex-col gap-2">
			<TabsList>
				<TabsTrigger value="histogram">Histogram</TabsTrigger>
				<TabsTrigger value="waveform">Waveform</TabsTrigger>
				<TabsTrigger value="vectorscope">Vectorscope</TabsTrigger>
				<TabsTrigger value="parade">Parade</TabsTrigger>
			</TabsList>
			<TabsContent value="histogram" className="min-h-0 flex-1">
				<HistogramChart histogram={histogram} />
			</TabsContent>
			<TabsContent value="waveform" className="min-h-0 flex-1">
				<WaveformCanvas waveform={waveform} />
			</TabsContent>
			<TabsContent value="vectorscope" className="flex min-h-0 flex-1 items-center justify-center">
				<VectorscopeCanvas vectorscope={vectorscope} />
			</TabsContent>
			<TabsContent value="parade" className="min-h-0 flex-1">
				<ParadeCanvas parade={parade} />
			</TabsContent>
		</Tabs>
	);
}

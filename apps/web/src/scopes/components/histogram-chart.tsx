"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import type { ScopeHistogram } from "@/scopes/types";

/**
 * A histogram is the one DaVinci-parity scope that's a genuinely good fit
 * for a line/area chart -- each channel is a single 256-length series
 * (count at each 8-bit level), unlike waveform/vectorscope/parade, which
 * are 2D density maps rendered as canvas heatmaps (see waveform-canvas.tsx
 * etc.). Channels are overlaid, not stacked -- they're four independent
 * measurements sharing one 0-255 axis, not parts of a whole. Colors are
 * fixed to R/G/B/white-for-luma rather than the shadcn --chart-N palette:
 * channel identity is the entire point of a histogram, not an arbitrary
 * category needing a themed accent.
 */
const CHART_CONFIG = {
	red: { label: "Red", color: "#ef4444" },
	green: { label: "Green", color: "#22c55e" },
	blue: { label: "Blue", color: "#3b82f6" },
	luma: { label: "Luma", color: "#e5e7eb" },
} satisfies ChartConfig;

export function HistogramChart({ histogram }: { histogram: ScopeHistogram }) {
	const data = Array.from({ length: 256 }, (_, level) => ({
		level,
		red: histogram.red[level] ?? 0,
		green: histogram.green[level] ?? 0,
		blue: histogram.blue[level] ?? 0,
		luma: histogram.luma[level] ?? 0,
	}));

	return (
		<ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
			<AreaChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
				<CartesianGrid vertical={false} className="stroke-white/10" />
				<XAxis
					dataKey="level"
					type="number"
					domain={[0, 255]}
					ticks={[0, 64, 128, 192, 255]}
					tickLine={false}
					axisLine={false}
					tickMargin={6}
				/>
				<YAxis hide />
				<ChartTooltip
					cursor={false}
					content={<ChartTooltipContent labelFormatter={(value) => `Level ${value}`} />}
				/>
				<Area
					dataKey="luma"
					type="monotone"
					fill="var(--color-luma)"
					fillOpacity={0.15}
					stroke="var(--color-luma)"
					strokeWidth={1}
					isAnimationActive={false}
				/>
				<Area
					dataKey="red"
					type="monotone"
					fill="var(--color-red)"
					fillOpacity={0.25}
					stroke="var(--color-red)"
					strokeWidth={1}
					isAnimationActive={false}
				/>
				<Area
					dataKey="green"
					type="monotone"
					fill="var(--color-green)"
					fillOpacity={0.25}
					stroke="var(--color-green)"
					strokeWidth={1}
					isAnimationActive={false}
				/>
				<Area
					dataKey="blue"
					type="monotone"
					fill="var(--color-blue)"
					fillOpacity={0.25}
					stroke="var(--color-blue)"
					strokeWidth={1}
					isAnimationActive={false}
				/>
			</AreaChart>
		</ChartContainer>
	);
}

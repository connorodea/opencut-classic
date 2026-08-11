/**
 * Shared type shapes for the 4 DaVinci-parity scopes (histogram/waveform/
 * vectorscope/parade — see COLOR_GRADING_DESIGN.md gap-map item 8).
 *
 * Deliberately zero runtime dependencies -- in particular, no import from
 * @/services/color-scope/service, which itself imports the not-yet-
 * published @connorodea/opencut-wasm package and would drag that block
 * into every file that needs these shapes. These interfaces are
 * structurally identical to what that service module produces (and to
 * rust/wasm/src/scopes.rs's *Output DTOs) -- TS's structural typing makes
 * that safe without a runtime coupling. Once the package publishes and
 * service.ts is committed, its exported types should re-export from here
 * rather than duplicate, but the presentational components in this
 * directory never need to know that.
 */

export interface ScopeHistogram {
	red: number[];
	green: number[];
	blue: number[];
	luma: number[];
}

export interface ScopeWaveform {
	width: number;
	lumaByColumn: number[][];
}

export interface ScopeVectorscope {
	buckets: number[][];
}

export interface ScopeParade {
	width: number;
	redByColumn: number[][];
	greenByColumn: number[][];
	blueByColumn: number[][];
}

export type ScopeType = "histogram" | "waveform" | "vectorscope" | "parade";

import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { primaryWheelsEffectDefinition } from "./primary-wheels";
import { logWheelsEffectDefinition } from "./log-wheels";
import { hslQualifierEffectDefinition } from "./hsl-qualifier";
import { lumaCurveEffectDefinition } from "./luma-curve";
import { lutEffectDefinition } from "./lut";
import { exposureEffectDefinition } from "./exposure";
import { whiteBalanceEffectDefinition } from "./white-balance";

const defaultEffects = [
	blurEffectDefinition,
	primaryWheelsEffectDefinition,
	logWheelsEffectDefinition,
	hslQualifierEffectDefinition,
	lumaCurveEffectDefinition,
	lutEffectDefinition,
	exposureEffectDefinition,
	whiteBalanceEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}

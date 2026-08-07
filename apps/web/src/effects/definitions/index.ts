import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { primaryWheelsEffectDefinition } from "./primary-wheels";
import { logWheelsEffectDefinition } from "./log-wheels";
import { hslQualifierEffectDefinition } from "./hsl-qualifier";

const defaultEffects = [
	blurEffectDefinition,
	primaryWheelsEffectDefinition,
	logWheelsEffectDefinition,
	hslQualifierEffectDefinition,
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

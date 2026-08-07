import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { primaryWheelsEffectDefinition } from "./primary-wheels";

const defaultEffects = [blurEffectDefinition, primaryWheelsEffectDefinition];

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

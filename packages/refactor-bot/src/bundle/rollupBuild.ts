import type { RollupCache, RollupOptions } from 'rollup';
import { rollup } from 'rollup';

const rollupCache: RollupCache = {
    modules: [],
    plugins: {},
};

export async function rollupBuild(opts: RollupOptions) {
    const { output: outputProp, ...inputProps } = opts;
    const output = Array.isArray(outputProp)
        ? outputProp
        : outputProp
          ? [outputProp]
          : [];
    const builder = await rollup({
        ...inputProps,
        cache: rollupCache,
    });
    const results = await Promise.all(
        output.map((out) => builder.generate(out))
    );
    return results;
}

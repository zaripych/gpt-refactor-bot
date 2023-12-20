import { createFilter } from '@rollup/pluginutils';
import type { TransformOptions } from 'esbuild';
import { transform } from 'esbuild';
import type { Plugin } from 'rollup';

const defaultOptions = {
    treeShaking: true,
};

type Filter = string | RegExp;

type Opts = TransformOptions & {
    include?: Filter[];
    exclude?: Filter[];
};

export function esbuild({
    include,
    exclude,
    ...options
}: Opts): Plugin<unknown> {
    options = { ...defaultOptions, ...options };
    const filter = createFilter(include, exclude);
    return {
        name: 'esbuild',
        async transform(src, id) {
            if (!filter(id)) {
                return null;
            }

            options.sourcefile = id;
            const { code, map } = await transform(src, options);
            return { code, map: map ? map : undefined };
        },
    };
}

export function esbuildVirtual(opts: Opts): Plugin<unknown> {
    const plugin = esbuild(opts);
    return {
        ...plugin,
        transform(this, code, id) {
            if (!plugin.transform || typeof plugin.transform !== 'function') {
                throw new Error('transform is not defined');
            }
            /**
             * @note this ensures that virtual modules are transformed
             * as well, since they will have a zero appended to the
             * beginning of their id the plugin filter would exclude
             * them unconditionally
             */
            return plugin.transform.apply(this, [code, id.replace('\0', '')]);
        },
    };
}

import virtual from '@rollup/plugin-virtual';
import type { Plugin } from 'rollup';

export default function rollupPluginVirtual(
    modules: Record<string, string>
): Plugin<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return virtual(modules) as Plugin<unknown>;
}

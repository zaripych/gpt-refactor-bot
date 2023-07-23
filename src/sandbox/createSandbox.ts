import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { spawnResult } from '../child-process/spawnResult';
import { randomText } from '../utils/randomText';
import { ensureSandboxSafe } from './ensureSandboxSafe';

type Opts = {
    /**
     * Defaults to temporary directory
     */
    root?: string;

    /**
     * Human readable tag/name describing the sandbox that
     * can be used as part of the sandbox directory name
     */
    tag: string;

    /**
     * Reuse existing sandbox with this id
     */
    sandboxId?: string;

    /**
     * The source code to be copied into the sandbox, including
     * .git directory and node_modules when present
     */
    source: string;
};

export async function createSandbox(opts: Opts) {
    const {
        tag,
        root = join(tmpdir(), 'refactor-bot-sandboxes'),
        sandboxId = randomText(16),
    } = opts;

    const sandboxDirectoryPath = join(root, `${tag}-${sandboxId}`);

    await mkdir(sandboxDirectoryPath, { recursive: true });

    await spawnResult('rsync', ['-a', opts.source, sandboxDirectoryPath], {
        exitCodes: [0],
    });

    await ensureSandboxSafe(sandboxDirectoryPath);

    return {
        sandboxId,
        sandboxDirectoryPath,
    };
}

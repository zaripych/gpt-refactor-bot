import { spawnResult } from '../child-process/spawnResult';

export async function gitCommit(opts: { location: string; message: string }) {
    await spawnResult(
        'git',
        /**
         * @note We skip verifications as we assume it is already integrated
         * into the refactor-bot algorithms
         */
        ['commit', '--message', opts.message, '--no-verify'],
        {
            cwd: opts.location,
            exitCodes: [0],
            logOnError: 'combined',
        }
    );
}

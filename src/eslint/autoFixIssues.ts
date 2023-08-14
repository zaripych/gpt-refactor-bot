import { determinePackageManager } from '../package-manager/determinePackageManager';
import { runPackageManagerScript } from '../package-manager/runPackageManagerScript';

export async function autoFixIssues(opts: {
    location: string;
    eslintScriptArgs: [string, ...string[]];
    filePaths: string[];
}) {
    const packageManager = await determinePackageManager({
        directory: opts.location,
    });

    const args = opts.eslintScriptArgs.slice(1);

    if (!args.includes('--fix')) {
        args.push('--fix');
    }

    args.push(...opts.filePaths);

    return await runPackageManagerScript({
        packageManager,
        location: opts.location,
        script: opts.eslintScriptArgs[0],
        args,
        logOnError: 'combined',
    });
}

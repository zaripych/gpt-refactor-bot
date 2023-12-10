import { globby } from 'globby';

const packages = async () =>
    await globby('packages/*', {
        onlyDirectories: true,
    });

const lintPackages = async () =>
    (await packages()).reduce(
        (acc, pack) => ({
            ...acc,
            [`${pack}/**/*.(js|jsx|ts|tsx)`]: [
                `repka --cwd ${pack} lint`,
                `prettier --write`,
            ],
            [`${pack}/**/*.(yaml|yml|json)`]: `prettier --write`,
        }),
        {}
    );

async function buildRegularLintStagedConfig() {
    return {
        ...(await lintPackages()),
        './*.(js|mjs|cjs|ts|mts|cts|jsx|tsx|yaml|yml|json)': `prettier --write`,
    };
}

async function isPackageJsonChanged() {
    const changedFiles = await globby('**/package.json', {
        gitignore: true,
        onlyFiles: true,
        onlyDirectories: false,
        ignore: ['**/node_modules/**/*'],
    });

    return changedFiles.length > 0;
}

async function execAsync(command) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsyncFn = promisify(exec);
    await execAsyncFn(command);
}

async function pnpmInstall() {
    await execAsync('pnpm install');
}

async function gitAdd() {
    await execAsync('git add .');
}

async function maybePnpmInstallAndBuildConfig() {
    const changed = await isPackageJsonChanged();

    if (changed) {
        await pnpmInstall();
        await gitAdd();
    }

    return await buildRegularLintStagedConfig();
}

export default await maybePnpmInstallAndBuildConfig();

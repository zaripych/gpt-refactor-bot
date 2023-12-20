export default () => {
    return {
        autoDetect: true,
        env: {
            params: {
                env: 'WALLABY_TESTS=true',
                runner: '--experimental-vm-modules --experimental-specifier-resolution=node',
            },
        },
        testFramework: {
            configFile:
                './node_modules/@repka-kit/ts/configs/jest/jestConfigRootUnit.mjs',
        },
    };
};

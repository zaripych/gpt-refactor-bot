module.exports = {
    useTabs: false,
    tabWidth: 4,
    singleQuote: true,
    trailingComma: 'es5',
    proseWrap: process.env.CHANGESETS_VERSION ? 'never' : 'always',
};

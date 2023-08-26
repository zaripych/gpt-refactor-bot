const assert = require('node:assert');

const { _builtinLibs } = require('node:repl');

/**
 * See https://github.com/lholmquist/node-builtins/blob/master/index.js
 * @returns {string[]}
 */
module.exports.getBuiltinLibs = () => {
    assert(Array.isArray(_builtinLibs));
    assert(_builtinLibs.length > 0);
    assert(typeof _builtinLibs[0] === 'string');
    return _builtinLibs;
};

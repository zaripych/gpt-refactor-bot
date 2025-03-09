import { readFileResultSerializers } from './readFile';
import { runTsMorphScriptArgumentsSerializers } from './runTsMorphScript';

export const argumentSerializersByFunctionName = {
    runTsMorphScript: runTsMorphScriptArgumentsSerializers,
};

export const resultSerializersByFunctionName = {
    readFile: readFileResultSerializers,
};

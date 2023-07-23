import { randomBytes } from 'crypto';

// 62 alphanumerics from ASCII: numbers, capitals, lowercase
const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const randomText = (length: number) => {
    // 62 * 4 - 1 = 247 < 255 - 8 numbers between 247 and 255 are discarded
    const usefulMax = alphabet.length * 4 - 1;
    let result = '';
    while (result.length < length) {
        for (const byte of randomBytes(length)) {
            if (byte <= usefulMax) {
                result += alphabet.charAt(byte % alphabet.length);
            }
            if (result.length === length) {
                break;
            }
        }
    }
    return result;
};

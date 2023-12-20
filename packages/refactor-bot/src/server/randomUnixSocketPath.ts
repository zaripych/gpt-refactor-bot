import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { randomText } from '../utils/randomText';

export function randomUnixSocketPath() {
    return join(tmpdir(), 'refactor-bot', `refactor-bot-${randomText(8)}.sock`);
}

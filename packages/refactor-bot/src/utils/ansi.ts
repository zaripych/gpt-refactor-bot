// See CSI and control sequences on Wikipedia
// https://en.wikipedia.org/wiki/ANSI_escape_code

export function saveCursorPosition() {
    if (!process.stdout.isTTY) {
        return;
    }
    process.stdout.write('\x1b[s');
}

export function restoreCursorPosition() {
    if (!process.stdout.isTTY) {
        return;
    }
    process.stdout.write('\x1b[u');
}

export function clearScreenFromCursorTillTheEnd() {
    if (!process.stdout.isTTY) {
        return;
    }
    process.stdout.write('\x1b[0J');
}

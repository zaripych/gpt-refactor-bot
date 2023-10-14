const compareStrings = (a: string, b: string) => (a === b ? 0 : a > b ? 1 : -1);

const comparePathComponents = (a: string[], b: string[]): 0 | 1 | -1 => {
    if (a.length === 0 && b.length === 0) {
        return 0;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const i = compareStrings(a[0]!, b[0]!);
    if (i === 0) {
        return comparePathComponents(a.slice(1), b.slice(1));
    } else {
        return i;
    }
};

const seps = /\\|\//g;

const comparePaths = (a: string, b: string) => {
    const componentsA = a.split(seps);
    const componentsB = b.split(seps);
    const result = comparePathComponents(componentsA, componentsB);
    return result;
};

export const sortPaths = (files: string[]) => {
    files.sort(comparePaths);
    return files;
};

export function lowerCamelCaseToKebabCase(str?: string) {
    if (!str) {
        throw new Error(
            `Cannot determine function name, please provide one as "name" option`
        );
    }
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function kebabCaseToLowerCamelCase(str?: string) {
    if (!str) {
        throw new Error(
            `Cannot determine function name, please provide one as "name" option`
        );
    }
    return str.replace(/-([a-z])/g, (g) => g[1]?.toUpperCase() ?? '');
}

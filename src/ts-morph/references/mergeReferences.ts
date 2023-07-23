export function mergeReferences<
    T extends { references: Array<{ pos: number }> }
>(references: Array<Map<string, T>>): Map<string, T> {
    if (references.length === 0 || !references[0]) {
        return new Map();
    }

    const refMap = references[0];

    for (const map of references.slice(1)) {
        for (const [filePath, entry] of map) {
            const existing = refMap.get(filePath);
            if (existing) {
                const deduplicatedPositions = new Map(
                    [...existing.references, ...entry.references].map((x) => [
                        x.pos,
                        x,
                    ])
                );
                refMap.set(filePath, {
                    ...existing,
                    references: Array.from(deduplicatedPositions.values()),
                });
            } else {
                refMap.set(filePath, entry);
            }
        }
    }

    return refMap;
}

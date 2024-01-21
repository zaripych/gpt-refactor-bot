export function formatBulletList(opts: {
    items: string[];
    empty?: string;
    heading?: string;
}) {
    if (opts.items.length === 0) {
        return opts.empty || '';
    }

    const list = opts.items.map((item) => `- ${item}`).join('\n');

    if (opts.heading) {
        return `${opts.heading}\n${list}`;
    }

    return list;
}

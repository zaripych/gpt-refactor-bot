export function formatCompletedTasks(opts: { completedTasks: string[] }) {
    return opts.completedTasks.length > 0
        ? `You already have completed the following tasks:

${opts.completedTasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}`
        : '';
}

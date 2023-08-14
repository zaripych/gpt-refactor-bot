import { formatCompletedTasks } from './formatCompletedTasks';
import { formatFileContents } from './formatFileContents';
import { formatFileDiff } from './formatFileDiff';
import { formatIssues } from './formatIssues';

export const executeFileTaskPromptText = (opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    task: string;
    completedTasks: string[];
    fileDiff?: string;
    issues: string[];
    language: string;
}) =>
    `${opts.objective}

We are now starting the process of refactoring one file at a time. Strictly focus only on a single file given below.

${formatFileContents(opts)}

${formatCompletedTasks(opts)}

${formatFileDiff(opts)}

${formatIssues(opts)}

Please perform the following task:

${opts.completedTasks.length + 1}. ${opts.task}`;

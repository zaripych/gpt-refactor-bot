import defaultChangelogGenerator from '@changesets/changelog-github';
import type {
    GetDependencyReleaseLine,
    GetReleaseLine,
} from '@changesets/types';

const getReleaseLine: GetReleaseLine = async (
    changeset,
    type,
    changelogOpts
) => {
    try {
        const result = await defaultChangelogGenerator.getReleaseLine(
            changeset,
            type,
            changelogOpts
        );
        return result.replaceAll(
            /**
             * @note don't thank dependabot, because it doesn't care!
             */
            'Thanks [@dependabot](https://github.com/apps/dependabot)!',
            ''
        );
    } catch (err) {
        /*
         * Handle the case when trying to release a snapshot locally via pnpm
         * command, which would result in an error if a pull request is not yet
         * created.
         */
        const repo =
            typeof changelogOpts?.['repo'] === 'string'
                ? changelogOpts['repo']
                : 'zaripych/repka';

        const commitLink = changeset.commit
            ? `[${changeset.commit}](https://github.com/${repo}/commit/${changeset.commit})`
            : '';

        return (
            ' - ' + [commitLink, changeset.summary].filter(Boolean).join(' - ')
        );
    }
};

const getDependencyReleaseLine: GetDependencyReleaseLine = async (
    changesets,
    dependenciesUpdated,
    changelogOpts
) => {
    console.log({
        changesets,
        dependenciesUpdated,
        changelogOpts: changelogOpts as unknown,
    });
    const result = await defaultChangelogGenerator.getDependencyReleaseLine(
        changesets,
        dependenciesUpdated,
        changelogOpts
    );
    return result;
};

const pair = {
    getReleaseLine,
    getDependencyReleaseLine,
};

export default pair;

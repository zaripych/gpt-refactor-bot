import { buildForNode, copyFiles, pipeline } from '@repka-kit/ts';

await pipeline(buildForNode(), () =>
    copyFiles({
        source: '../../',
        destination: 'dist',
        include: ['README.md', 'LICENSE.md'],
    })
);

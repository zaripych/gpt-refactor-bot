import { expect, it } from '@jest/globals';
import dedent from 'dedent';
import { z } from 'zod';

import { parseJsonResponse } from './parseJsonResponse';

it('should return parsed response', () => {
    expect(
        parseJsonResponse(
            dedent`
                \`\`\`json
                {
                    "summary": "The objective was not achieved. The algorithm did not replace 'readFile' from 'fs/promises' with 'readFileSync' from 'fs'. Instead, it redefined 'readFile' within the 'defaultDeps' object to call itself recursively without any changes, which will lead to a stack overflow if executed.",
                    "requirements": [
                        {
                            "description": "Replace all usages of 'readFile' from 'fs/promises' with 'readFileSync' from 'fs'",
                            "isObjective": true,
                            "satisfied": false
                        },
                        {
                            "description": "The code produced is minimal and doesn't make modifications which are unnecessary or not requested by the user",
                            "isObjective": false,
                            "satisfied": false
                        }
                    ]
                }
                \`\`\`
            `,
            z.object({
                summary: z.string(),
                requirements: z.array(
                    z.object({
                        description: z.string(),
                        isObjective: z.boolean(),
                        satisfied: z.boolean(),
                    })
                ),
            })
        )
    ).toEqual({
        summary:
            "The objective was not achieved. The algorithm did not replace 'readFile' from 'fs/promises' with 'readFileSync' from 'fs'. Instead, it redefined 'readFile' within the 'defaultDeps' object to call itself recursively without any changes, which will lead to a stack overflow if executed.",
        requirements: [
            {
                description:
                    "Replace all usages of 'readFile' from 'fs/promises' with 'readFileSync' from 'fs'",
                isObjective: true,
                satisfied: false,
            },
            {
                description:
                    "The code produced is minimal and doesn't make modifications which are unnecessary or not requested by the user",
                isObjective: false,
                satisfied: false,
            },
        ],
    });
});

import { expect, it } from '@jest/globals';

import { typeFootprint } from './typeFootprint';

it('works for simple types', async () => {
    /**
     * @todo fix type parameters rendering or use different approach
     */
    expect(
        await typeFootprint({
            identifier: 'executeFunction',
            filePath: 'src/functions/executeFunction.ts',
        })
    ).toMatchInlineSnapshot(`
        "(opts: {
          name: ;
          arguments: ;
        } & {
          strict?: false | true;
          repositoryRoot?: string;
          dependencies?: () => {
            logger: {
              error: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              info: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              fatal: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              warn: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              debug: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              trace: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              silent: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              log: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              level: string;
            };
            findRepositoryRoot(startAt: string): Promise<string>;
          };
        } | {
          name: string;
          arguments: never;
        } & {
          strict?: false | true;
          repositoryRoot?: string;
          dependencies?: () => {
            logger: {
              error: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              info: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              fatal: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              warn: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              debug: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              trace: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              silent: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              log: {
                (obj: , msg: undefined | string, args: any[]): void
                (obj: unknown, msg: undefined | string, args: any[]): void
                (msg: string, args: any[]): void
              };
              level: string;
            };
            findRepositoryRoot(startAt: string): Promise<string>;
          };
        }) => Promise<
          Array<
            {
              filePath: string;
              references: Array<
                {
                  pos: number;
                  line: number;
                  column: number;
                  excerpt: string;
                }
              >;
              package?: string;
            }
          > | Array<
            {
              filePath: string;
              imports: Array<
                {
                  pos: number;
                  line: number;
                  column: number;
                  excerpt: string;
                }
              >;
              package?: string;
            }
          > | {
            declaration: string;
          } | {
            error: {
              message: string;
            };
          }
        >"
    `);
});

import type { ErrorResponse, Models } from '../chat-gpt/api';
import { AbortError } from './abortError';

export type GptResponseInfo =
    | {
          url: string;
          status: number;
          statusText: string;
          text: string;
          headers: Record<string, string>;
      }
    | {
          url: string;
          status: number;
          statusText: string;
          json: ErrorResponse;
          headers: Record<string, string>;
      };

export type GptRequestErrorOpts = ErrorOptions & {
    model?: Models;
    response?: GptResponseInfo;
};

export class GptRequestError extends AbortError {
    override name = 'GptResponseError';
    readonly model?: Models;
    readonly response?: GptResponseInfo;

    constructor(message: string, options?: GptRequestErrorOpts) {
        const { response, ...rest } = options ?? {};
        super(message, rest);
        this.response = response;
        this.model = options?.model;
    }
}

import type { Models, Opts, Response } from './api';

const pricing = {
    o1: {
        perKTokenInput: 3 / 1000,
        perKTokenOutput: 12 / 1000,
    },
    'o1-mini': {
        perKTokenInput: 3 / 1000,
        perKTokenOutput: 12 / 1000,
    },
    'o1-preview': {
        perKTokenInput: 15 / 1000,
        perKTokenOutput: 60 / 1000,
    },
    'gpt-4o': {
        perKTokenInput: 2.5 / 1000,
        perKTokenOutput: 10 / 1000,
    },
    'gpt-4-turbo-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4-0125-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4-1106-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4-1106-vision-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4': {
        perKTokenInput: 0.03,
        perKTokenOutput: 0.06,
    },
    'gpt-4-32k': {
        perKTokenInput: 0.06,
        perKTokenOutput: 0.12,
    },
    'gpt-3.5-turbo': {
        perKTokenInput: 0.001,
        perKTokenOutput: 0.002,
    },
    'gpt-3.5-turbo-16k': {
        perKTokenInput: 0.003,
        perKTokenOutput: 0.004,
    },
} satisfies Partial<
    Record<Models, { perKTokenInput: number; perKTokenOutput: number }>
>;

export function estimatePrice(
    opts: Pick<Opts, 'functions' | 'messages' | 'model'>
): number {
    const inputTokens = opts.messages.reduce(
        (acc, message) => acc + JSON.stringify(message).length,
        0
    );

    const model = opts.model || 'gpt-3.5-turbo-0613';

    const pricingModels = Object.keys(pricing);
    const matchingPricingModel = pricingModels.find((pricingModel) =>
        model.startsWith(pricingModel)
    );

    if (!matchingPricingModel) {
        throw new Error(`Unknown model ${model}`);
    }

    const price = pricing[matchingPricingModel as keyof typeof pricing] as
        | {
              perKTokenInput: number;
              perKTokenOutput: number;
          }
        | undefined;

    if (!price) {
        throw new Error(`Unknown model ${model}`);
    }

    return (inputTokens / 1000) * price.perKTokenInput;
}

export function calculatePrice(
    opts: Pick<Response, 'usage'> & {
        model: string;
    }
) {
    const model = opts.model;

    const pricingModels = Object.keys(pricing);

    const matchingPricingModel = pricingModels.find((pricingModel) =>
        model.startsWith(pricingModel)
    );

    if (!matchingPricingModel) {
        throw new Error(`Unknown model ${model}`);
    }

    const price = pricing[matchingPricingModel as keyof typeof pricing] as
        | {
              perKTokenInput: number;
              perKTokenOutput: number;
          }
        | undefined;

    if (!price) {
        throw new Error(`Unknown model ${model}`);
    }

    const promptPrice = (opts.usage.promptTokens / 1000) * price.perKTokenInput;
    const completionPrice =
        (opts.usage.completionTokens / 1000) * price.perKTokenInput;

    return {
        totalPrice: promptPrice + completionPrice,
        promptPrice,
        completionPrice,
    };
}

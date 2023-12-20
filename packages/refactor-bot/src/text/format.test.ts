import { expect, it } from '@jest/globals';

import { markdown } from '../markdown/markdown';
import { format } from './format';

it('looks readable when parameters are inline', () => {
    const result = format(
        markdown`
            # Preface

            This is a test for %var1% and %var2%.

            # Details

            We want our inline markdown to be formatted by prettier. This
            ensures that the markdown is easy to read and maintain - both in the
            code editor or on GitHub.

            At the same time we do not want template literal vars to break the
            formatting. Tagged template literal variables are a blunder to read
            when formatted by prettier, so we want to avoid that.

            Therefore, we use a custom substitute function that replaces
            placeholders with values and rely on prettier to format the
            markdown.

            In addition to that, our markdown is also de-dented using the dedent
            npm module.

            The choice of the \`%\` prefix is to ensure that the markdown is
            compatible with TypeScript code blocks.

            ~~~ts
            %example%
            ~~~

            If the code wasn't de-dented, it would have to look like the
            expectation below.
        `,
        {
            var1: 'readability',
            var2: 'clarity',
            example: 'console.log("Hello, World!");',
        }
    );

    expect(result).toBe(`# Preface

This is a test for readability and clarity.

# Details

We want our inline markdown to be formatted by prettier. This
ensures that the markdown is easy to read and maintain - both in the
code editor or on GitHub.

At the same time we do not want template literal vars to break the
formatting. Tagged template literal variables are a blunder to read
when formatted by prettier, so we want to avoid that.

Therefore, we use a custom substitute function that replaces
placeholders with values and rely on prettier to format the
markdown.

In addition to that, our markdown is also de-dented using the dedent
npm module.

The choice of the \`%\` prefix is to ensure that the markdown is
compatible with TypeScript code blocks.

~~~ts
console.log("Hello, World!");
~~~

If the code wasn't de-dented, it would have to look like the
expectation below.`);
});

it('works when variables are empty strings', () => {
    const result = format(
        markdown`
            # Empty variables handling

            Often we want to skip a variable if it is empty. This is useful when
            the variable is optional %empty%.

            In these cases we can simply use the \`||\` operator to provide a
            default value but that might lead to additional empty lines. This is
            not a problem with most markdown renderers.

            Well, a model might add extra meaning to it. While that's unlikely,
            I've decided to add an option to remove extra empty lines and
            spaces. This should make the prompts we send to the model more
            readable. %empty%

            %empty%

            There is an extra parameter that allows us to remove extra empty
            lines before and after the substitution. %empty% This should remove
            the extra empty lines and spaces but not too many %empty%.

            %empty% We cannot do much about cases where the variable is at the
            start of the sentence like this, so the "We" could remain
            uncapitalized.
        `,
        {
            empty: '',
        },
        {
            trimEmptyLines: true,
            trimSpaces: true,
        }
    );

    expect(result).toBe(`# Empty variables handling

Often we want to skip a variable if it is empty. This is useful when
the variable is optional.

In these cases we can simply use the \`||\` operator to provide a
default value but that might lead to additional empty lines. This is
not a problem with most markdown renderers.

Well, a model might add extra meaning to it. While that's unlikely,
I've decided to add an option to remove extra empty lines and
spaces. This should make the prompts we send to the model more
readable.

There is an extra parameter that allows us to remove extra empty
lines before and after the substitution. This should remove
the extra empty lines and spaces but not too many.

We cannot do much about cases where the variable is at the
start of the sentence like this, so the "We" could remain
uncapitalized.`);
});

it('should substitute when the text around placeholder is empty', () => {
    const text = '%name%';
    const values = { name: 'World' };

    const result = format(text, values);

    expect(result).toBe('World');
});

it('should substitute when the text around placeholder is whitespace', () => {
    const text = ' %name% ';
    const values = { name: 'World' };

    const result = format(text, values);

    expect(result).toBe(' World ');
});

it('should substitute placeholder with given values', () => {
    const text = 'Hello, %name%!';
    const values = { name: 'World' };

    const result = format(text, values);

    expect(result).toBe('Hello, World!');
});

it('should not change the text for empty placeholders', () => {
    const text = 'Hello, %%!';

    const result = format(text, {});

    expect(result).toBe('Hello, %%!');
});

it('should not change the text for placeholders with spaces', () => {
    const text = '- % % -';

    const result = format(text, {});

    expect(result).toBe('- % % -');
});

it('should not change the text for placeholders with punctuation', () => {
    const text = '- %-% -';

    const result = format(text, {});

    expect(result).toBe('- %-% -');
});

it('should throw an error if value for substitute field does not exist', () => {
    const text = 'Hello, %name%! I am %age% years old.';
    const values = { name: 'World' };

    expect(() => {
        format(text, values);
    }).toThrow('value of age is missing');
});

it('should substitute placeholder with different prefix character', () => {
    const text = 'Hello, *name*!';
    const values = { name: 'World' };
    /**
     * @note changing prefix and suffix to '*'
     */
    const options = { prefix: '*' };

    const result = format(text, values, options);

    expect(result).toBe('Hello, World!');
});

it('should throw an error when substitute field is not present in the values object', () => {
    const text = 'Hello, %name%!';
    /**
     * @note name is present, but age is not in the values object
     */
    const values = { age: '20' };

    expect(() => {
        format(text, values);
    }).toThrow('value of name is missing');
});

it('should handle field value not being a string', () => {
    const text = 'Hello, %name%, %age%!';
    /**
     * @note age is not a string in the values object
     */
    const values = { name: 'World', age: 20 };

    expect(() => {
        // @ts-expect-error age is not a string
        format(text, values);
    }).toThrow('value of age is not a string');
});

it('should return the same string when there are no placeholders to substitute', () => {
    const text = 'Hello, World!';
    const values = {};

    const result = format(text, values);

    expect(result).toBe('Hello, World!');
});

it('should not substitute recursively', () => {
    const text = 'Hello, %recursive%';
    const values = {
        recursive: 'Hello again %recursive% and %recursive%',
    };

    const result = format(text, values);

    expect(result).toBe('Hello, Hello again %recursive% and %recursive%');
});

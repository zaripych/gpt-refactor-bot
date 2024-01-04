import type { Project } from 'ts-morph';
import type { Node, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';

function firstLineOf(text: string, trimSuffix?: string) {
    const firstLine = text.match(/.*$/gm)?.[0] || text;
    return firstLine !== text ? [firstLine, trimSuffix].join('') : firstLine;
}

type Data = {
    causes: Array<{
        filePath: string;
        line: number;
        excerpt: string;
    }>;
    fileComplexity: Array<{
        filePath: string;
        complexity: number;
    }>;
    functionComplexity: Array<{
        filePath: string;
        functionName?: string;
        line: number;
        complexity: number;
    }>;
};

export function mapProject(project: Project) {
    const sourceFiles = project.getSourceFiles();

    const data: Data = {
        causes: [],
        fileComplexity: [],
        functionComplexity: [],
    };

    for (const file of sourceFiles) {
        const filePath = file.getFilePath();

        const fileData: typeof data = {
            causes: [],
            fileComplexity: [],
            functionComplexity: [],
        };

        calculateCyclomaticComplexity(file, file, fileData);

        const fileComplexity =
            fileData.functionComplexity.length > 0
                ? Math.max(
                      ...fileData.functionComplexity.map(
                          ({ complexity }) => complexity
                      )
                  )
                : 1;

        data.fileComplexity.push({
            complexity: fileComplexity,
            filePath,
        });
        data.functionComplexity.push(
            ...fileData.functionComplexity.map((fileData) => ({
                ...fileData,
                filePath,
            }))
        );
    }

    return data.functionComplexity;
}

const calculateCyclomaticComplexity = (
    sourceFile: SourceFile,
    node: Node,
    data: {
        causes: Array<{
            line: number;
            excerpt: string;
        }>;
        functionComplexity: Array<{
            functionName?: string;
            line: number;
            complexity: number;
        }>;
    }
) => {
    let nodeComplexity = 0;

    const increment = (node: Node) => {
        nodeComplexity += 1;
        data.causes.push({
            line: sourceFile.getLineAndColumnAtPos(node.getPos()).line,
            excerpt: firstLineOf(node.getText()),
        });
    };

    calculateComplexityForNode(node, increment);

    node.forEachChild((child) => {
        nodeComplexity += calculateCyclomaticComplexity(
            sourceFile,
            child,
            data
        );
    });

    switch (node.getKind()) {
        case SyntaxKind.MethodDeclaration:
            {
                increment(node);
                const functionName = node
                    .asKindOrThrow(SyntaxKind.MethodDeclaration)
                    .getName();
                const { line } = node
                    .getSourceFile()
                    .getLineAndColumnAtPos(node.getPos());

                data.functionComplexity.push({
                    complexity: nodeComplexity,
                    functionName,
                    line,
                });
            }
            break;
        case SyntaxKind.ArrowFunction:
            {
                const functionName =
                    node
                        .asKindOrThrow(SyntaxKind.ArrowFunction)
                        .getParentIfKind(SyntaxKind.VariableDeclaration)
                        ?.getName() ||
                    node
                        .asKindOrThrow(SyntaxKind.ArrowFunction)
                        .getPreviousSiblingIfKind(SyntaxKind.PropertyAssignment)
                        ?.getName();
                increment(node);
                const { line } = node
                    .getSourceFile()
                    .getLineAndColumnAtPos(node.getPos());

                data.functionComplexity.push({
                    complexity: nodeComplexity,
                    functionName: functionName ?? 'anonymous',
                    line,
                });
            }
            break;
        case SyntaxKind.FunctionDeclaration:
            {
                increment(node);
                const functionName = node
                    .asKindOrThrow(SyntaxKind.FunctionDeclaration)
                    .getName();
                const { line } = node
                    .getSourceFile()
                    .getLineAndColumnAtPos(node.getPos());

                data.functionComplexity.push({
                    complexity: nodeComplexity,
                    functionName,
                    line,
                });
            }
            break;
        default:
            break;
    }

    return nodeComplexity;
};

function calculateComplexityForNode(
    node: Node,
    increment: (node: Node) => void
) {
    switch (node.getKind()) {
        case SyntaxKind.IfStatement:
        case SyntaxKind.ForInStatement:
        case SyntaxKind.ForOfStatement:
        case SyntaxKind.ForStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.TryStatement:
        case SyntaxKind.CatchClause:
        case SyntaxKind.ConditionalExpression:
        case SyntaxKind.QuestionDotToken:
        case SyntaxKind.QuestionQuestionToken:
            increment(node);
            break;
        case SyntaxKind.SwitchStatement:
            {
                const switchStmt = node.asKindOrThrow(
                    SyntaxKind.SwitchStatement
                );
                switchStmt
                    .getCaseBlock()
                    .getClauses()
                    .forEach((clause) => {
                        if (clause.getKind() === SyntaxKind.CaseClause) {
                            increment(clause);
                        }
                    });
            }
            break;
        case SyntaxKind.BinaryExpression:
            {
                const binaryExpr = node.asKindOrThrow(
                    SyntaxKind.BinaryExpression
                );
                if (
                    binaryExpr.getOperatorToken().getKind() ==
                        SyntaxKind.AmpersandAmpersandToken ||
                    binaryExpr.getOperatorToken().getKind() ==
                        SyntaxKind.BarBarToken
                ) {
                    increment(binaryExpr);
                }
            }
            break;
        default:
            break;
    }
}

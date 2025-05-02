import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Diagnostic,
  DiagnosticSeverity,
  TextDocumentSyncKind,
  InitializeResult,
  Position,
  Range,
  InsertTextFormat
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as ts from 'typescript';

// Временная заглушка для Swagger спецификации
interface SwaggerSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer';
  properties?: { [key: string]: SwaggerSchema };
  items?: SwaggerSchema;
  required?: string[];
  example?: any;
}

interface SwaggerMethod {
  parameters?: Array<{
    in: 'query' | 'header' | 'path' | 'cookie' | 'body';
    name: string;
    required?: boolean;
    schema?: SwaggerSchema;
  }>;
}

interface SwaggerPath {
  get?: SwaggerMethod;
  post?: SwaggerMethod;
  put?: SwaggerMethod;
  delete?: SwaggerMethod;
  patch?: SwaggerMethod;
}

const mockSwagger: { [key: string]: SwaggerPath } = {
  '/api/users': {
    get: {
      parameters: [
        { in: 'query', name: 'id', schema: { type: 'number', example: 1 } }
      ]
    },
    post: {
      parameters: [
        {
          in: 'body',
          name: 'user',
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', example: 'john_doe' },
              email: { type: 'string', example: 'john@example.com' },
              age: { type: 'integer', example: 30 }
            },
            required: ['username', 'email']
          }
        }
      ]
    }
  },
  '/api/products': {
    get: {
      parameters: [
        { in: 'query', name: 'search', schema: { type: 'string', example: 'product name' } }
      ]
    },
    put: {
      parameters: [
        {
          in: 'body',
          name: 'product',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'New Product' },
              price: { type: 'number', example: 9.99 }
            },
            required: ['name', 'price']
          }
        }
      ]
    }
  }
};

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', ':', '\'', '"']
      }
    }
  };
  return result;
});

connection.onInitialized(() => {
  connection.console.log('Language server is now running!');
});

connection.onCompletion(
  async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return [];
    }

    const position = textDocumentPosition.position;
    const offset = document.offsetAt(position);
    const text = document.getText();

    const sourceFile = ts.createSourceFile(
      textDocumentPosition.textDocument.uri,
      text,
      ts.ScriptTarget.Latest,
      true
    );

    const completions: CompletionItem[] = [];

    ts.forEachChild(sourceFile, function visit(node) {
      if (ts.isCallExpression(node)) {
        const call = node as ts.CallExpression;
        if (ts.isPropertyAccessExpression(call.expression)) {
          const propAccess = call.expression as ts.PropertyAccessExpression;
          if (
            (ts.isIdentifier(propAccess.expression) &&
              (propAccess.expression.text === '$' || propAccess.expression.text === 'jQuery')) &&
            ts.isIdentifier(propAccess.name) &&
            propAccess.name.text === 'ajax'
          ) {
            if (call.arguments.length > 0 && ts.isObjectLiteralExpression(call.arguments[0])) {
              const configObject = call.arguments[0] as ts.ObjectLiteralExpression;

              const start = document.offsetAt(document.positionAt(configObject.getStart()));
              const end = document.offsetAt(document.positionAt(configObject.getEnd()));

              if (offset >= start && offset <= end) {
                // Курсор находится внутри объекта $.ajax
                completions.push(...getAjaxCompletionItems(configObject, textDocumentPosition, document));
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    });

    return completions;
  }
);

function getAjaxCompletionItems(configObject: ts.ObjectLiteralExpression, textDocumentPosition: TextDocumentPositionParams, document: TextDocument): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const offset = document.offsetAt(textDocumentPosition.position);

  let currentUrl: string | undefined;
  let currentType: string | undefined;

  // Сначала собираем информацию о текущих url и type
  for (const prop of configObject.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      if (prop.name.text === 'url' && ts.isStringLiteral(prop.initializer)) {
        currentUrl = prop.initializer.text;
      } else if ((prop.name.text === 'type' || prop.name.text === 'method') && ts.isStringLiteral(prop.initializer)) {
        currentType = prop.initializer.text.toLowerCase();
      }
    }
  }

  // Определяем, находимся ли мы внутри существующего свойства для автодополнения значений
  for (const prop of configObject.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;

        // Проверяем, находимся ли мы внутри строкового литерала
        if (ts.isStringLiteral(prop.initializer)) {
          const valueStart = document.offsetAt(document.positionAt(prop.initializer.getStart()));
          const valueEnd = document.offsetAt(document.positionAt(prop.initializer.getEnd()));

          // Курсор находится между кавычками (или сразу после открывающей кавычки)
          if (offset > valueStart && offset <= valueEnd) {
            if (propName === 'url') {
              return Object.keys(mockSwagger).map(url => ({
                label: url,
                kind: CompletionItemKind.Value,
                insertText: url,
                filterText: url
              }));
            } else if (propName === 'type' || propName === 'method') {
              if (currentUrl && mockSwagger[currentUrl]) {
                return Object.keys(mockSwagger[currentUrl]).map(method => ({
                  label: method.toUpperCase(),
                  kind: CompletionItemKind.Value,
                  insertText: method.toUpperCase(),
                  filterText: method.toUpperCase()
                }));
              }
            }
          }
        }
        // Проверяем, находимся ли мы на позиции значения свойства data
        else if (propName === 'data') {
          const afterColonOffset = document.offsetAt(document.positionAt(prop.name.getEnd())) + 1;
          const propEndOffset = document.offsetAt(document.positionAt(prop.getEnd()));

          // Курсор находится после двоеточия свойства 'data' или внутри потенциального объекта
          if (offset >= afterColonOffset && offset <= propEndOffset + 1) {
            if (currentUrl && currentType && ['post', 'put', 'patch'].includes(currentType)) {
              const method = mockSwagger[currentUrl]?.[currentType as keyof SwaggerPath];
              if (method) {
                const bodyParam = method.parameters?.find(param => param.in === 'body');
                if (bodyParam?.schema?.properties) {
                  const completionsForData: CompletionItem[] = [];
                  for (const propName in bodyParam.schema.properties) {
                    const propSchema = bodyParam.schema.properties[propName];
                    const isRequired = bodyParam.schema.required?.includes(propName);

                    let insertTextForProp: string;
                    let detailForProp: string = propSchema.type || '';

                    if (propSchema.type === 'object' && propSchema.properties) {
                      insertTextForProp = `"${propName}": ${generateDataSnippet(propSchema, 2, true)}`;
                      detailForProp = 'object';
                    } else if (propSchema.type === 'array' && propSchema.items) {
                      insertTextForProp = `"${propName}": [\n\t\t\${1:${getDefaultValue(propSchema.items.type)}}\n\t]`;
                      detailForProp = 'array';
                    } else {
                      insertTextForProp = `"${propName}": \${1:${propSchema.example !== undefined ? JSON.stringify(propSchema.example) : getDefaultValue(propSchema.type)}}`;
                      detailForProp += isRequired ? ' (обязательное)' : ' (необязательное)';
                    }

                    const item: CompletionItem = {
                      label: propName,
                      kind: CompletionItemKind.Property,
                      insertText: insertTextForProp,
                      insertTextFormat: InsertTextFormat.Snippet,
                      detail: detailForProp
                    };

                    // Проверяем, был ли триггер точкой
                    const currentPosition = textDocumentPosition.position;
                    const rangeBefore = Range.create(
                      { line: currentPosition.line, character: currentPosition.character - 1 },
                      currentPosition
                    );
                    const charBefore = document.getText(rangeBefore);

                    if (charBefore === '.') {
                      // Если предыдущий символ был точкой,
                      // создаем textEdit для замены точки и того, что пользователь мог начать вводить
                      const replaceRange = Range.create(
                        { line: currentPosition.line, character: currentPosition.character - 1 },
                        currentPosition
                      );
                      item.textEdit = {
                        range: replaceRange,
                        newText: insertTextForProp
                      };
                      item.insertText = insertTextForProp;
                    } else {
                      item.insertText = insertTextForProp;
                    }

                    completionsForData.push(item);
                  }
                  return completionsForData;
                }
              }
            }
          }
        }
      }
    }
  }

  // Если курсор находится внутри объекта конфигурации, но не внутри значения,
  // предлагаем доступные свойства с двоеточием и кавычками
  const configObjectStart = document.offsetAt(document.positionAt(configObject.getStart()));
  const configObjectEnd = document.offsetAt(document.positionAt(configObject.getEnd()));

  if (offset > configObjectStart && offset < configObjectEnd) {
    const existingProps = configObject.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);
    const potentialProps = ['url', 'type', 'method', 'data'];
    return potentialProps
      .filter(prop => !existingProps.includes(prop))
      .map(prop => {
        let insertText = `${prop}: `;
        let kind: CompletionItemKind;
        let detail: string | undefined;

        if (prop === 'url') {
          insertText += `$1`;
          detail = 'URL запроса';
          kind = CompletionItemKind.Snippet;
        } else if (prop === 'type' || prop === 'method') {
          insertText += `$1`;
          detail = 'HTTP метод';
          kind = CompletionItemKind.Snippet;
        } else if (prop === 'data') {
          insertText += `{\n\t$1\n}`;
          detail = 'Данные запроса (body)';
          kind = CompletionItemKind.Snippet;
        } else {
          kind = CompletionItemKind.Property;
        }

        return {
          label: prop,
          kind: kind,
          insertText: insertText,
          insertTextFormat: InsertTextFormat.Snippet,
          detail: detail
        };
      });
  }

  return completions;
}

function generateDataSnippet(schema: SwaggerSchema, level: number = 1, includeBraces: boolean = true): string {
  if (schema.type === 'object' && schema.properties) {
    const indent = '  '.repeat(level);
    let snippet = includeBraces ? '{\n' : '';
    let i = 1;
    for (const key in schema.properties) {
      const prop = schema.properties[key];
      const isRequired = schema.required?.includes(key);
      snippet += `${indent}  "${key}": `;
      if (prop.type === 'object' && prop.properties) {
        snippet += generateDataSnippet(prop, level + 1);
      } else if (prop.type === 'array' && prop.items) {
        snippet += '[\n';
        snippet += `${indent}    ${generateDataSnippet(prop.items, level + 2)}`;
        snippet += `\n${indent}  ]`;
      } else {
        snippet += `\${${i++}:${prop.example !== undefined ? JSON.stringify(prop.example) : getDefaultValue(prop.type)}}`;
      }
      snippet += `${isRequired ? '' : '?'},\n`;
    }
    snippet = snippet.replace(/,\n$/, '\n'); // Удаляем последнюю запятую
    snippet += includeBraces ? `\n${'  '.repeat(level - 1)}}` : '';
    return snippet;
  }
  return getDefaultValue(schema.type);
}

function getDefaultValue(type?: string): string {
  switch (type) {
    case 'string': return '""';
    case 'number':
    case 'integer': return '0';
    case 'boolean': return 'true';
    case 'array': return '[]';
    case 'object': return '{}';
    default: return 'null';
  }
}

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    return item;
  }
);

documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

documents.onDidOpen(open => {
  validateTextDocument(open.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const sourceFile = ts.createSourceFile(
    textDocument.uri,
    text,
    ts.ScriptTarget.Latest,
    true
  );

  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isCallExpression(node)) {
      const call = node as ts.CallExpression;
      if (ts.isPropertyAccessExpression(call.expression)) {
        const propAccess = call.expression as ts.PropertyAccessExpression;
        if (
          (ts.isIdentifier(propAccess.expression) &&
            (propAccess.expression.text === '$' || propAccess.expression.text === 'jQuery')) &&
          ts.isIdentifier(propAccess.name) &&
          propAccess.name.text === 'ajax'
        ) {
          if (call.arguments.length > 0 && ts.isObjectLiteralExpression(call.arguments[0])) {
            const configObject = call.arguments[0] as ts.ObjectLiteralExpression;
            processAjaxConfigForDiagnostics(configObject, textDocument, diagnostics);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  });

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function processAjaxConfigForDiagnostics(configObject: ts.ObjectLiteralExpression, textDocument: TextDocument, diagnostics: Diagnostic[]) {
  let urlNode: ts.StringLiteral | undefined;
  let typeNode: ts.StringLiteral | undefined;
  let dataNode: ts.ObjectLiteralExpression | undefined;

  for (const prop of configObject.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;
        if (propName === 'url' && ts.isStringLiteral(prop.initializer)) {
          urlNode = prop.initializer;
        } else if ((propName === 'type' || propName === 'method') && ts.isStringLiteral(prop.initializer)) {
          typeNode = prop.initializer;
        } else if (propName === 'data' && ts.isObjectLiteralExpression(prop.initializer)) {
          dataNode = prop.initializer;
        }
      }
    }
  }

  if (urlNode) {
    const url = urlNode.text;
    if (!mockSwagger[url]) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: textDocument.positionAt(urlNode.getStart()),
          end: textDocument.positionAt(urlNode.getEnd())
        },
        message: `Неизвестный URL: ${url}`,
        source: 'swagger-lsp'
      });
    } else if (typeNode) {
      const type = typeNode.text.toLowerCase();
      if (!mockSwagger[url]?.[type as keyof SwaggerPath]) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: textDocument.positionAt(typeNode.getStart()),
            end: textDocument.positionAt(typeNode.getEnd())
          },
          message: `Недопустимый HTTP метод '${type.toUpperCase()}' для URL: ${url}`,
          source: 'swagger-lsp'
        });
      } else if (['post', 'put', 'patch'].includes(type) && dataNode) {
        const method = mockSwagger[url]?.[type as keyof SwaggerPath];
        if (method) {
          const bodyParam = method.parameters?.find(param => param.in === 'body');

          if (bodyParam?.schema?.properties) {
            const requiredProps = bodyParam.schema.required || [];
            const dataProperties = dataNode.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);

            for (const requiredProp of requiredProps) {
              if (!dataProperties.includes(requiredProp)) {
                const dataRange = {
                  start: textDocument.positionAt(dataNode.getStart()),
                  end: textDocument.positionAt(dataNode.getEnd())
                };
                diagnostics.push({
                  severity: DiagnosticSeverity.Error,
                  range: dataRange,
                  message: `Отсутствует обязательное поле '${requiredProp}' в data`,
                  source: 'swagger-lsp'
                });
              }
            }

            // Пример очень простой проверки типов
            for (const prop of dataNode.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                const propName = prop.name.text;
                const schemaProp = bodyParam.schema.properties[propName];
                if (schemaProp) {
                  const propType = getNodeType(prop.initializer);
                  if (schemaProp.type && propType && schemaProp.type !== propType) {
                    // Разрешаем 'number' для 'integer'
                    if (!(schemaProp.type === 'integer' && propType === 'number')) {
                      diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: {
                          start: textDocument.positionAt(prop.initializer.getStart()),
                          end: textDocument.positionAt(prop.initializer.getEnd())
                        },
                        message: `Ожидается тип '${schemaProp.type}' для поля '${propName}', получен '${propType}'`,
                        source: 'swagger-lsp'
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

function getNodeType(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node)) {
    return 'string';
  } else if (ts.isNumericLiteral(node)) {
    return 'number';
  } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return 'boolean';
  } else if (ts.isArrayLiteralExpression(node)) {
    return 'array';
  } else if (ts.isObjectLiteralExpression(node)) {
    return 'object';
  }
  return undefined;
}

documents.listen(connection);
connection.listen();
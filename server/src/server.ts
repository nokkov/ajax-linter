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
  Range
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as ts from 'typescript';
import { mockSwagger, SwaggerPath, SwaggerMethod, SwaggerSchema } from './types/mockSwagger';

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
                completions.push(...getAjaxCompletionItems(configObject, position, document));
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

function getAjaxCompletionItems(configObject: ts.ObjectLiteralExpression, position: Position, document: TextDocument): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const offset = document.offsetAt(position);

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

  // Теперь определяем контекст автодополнения
  for (const prop of configObject.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;

        // Проверяем, находится ли курсор над ключом свойства или сразу после него
        const keyStart = document.offsetAt(document.positionAt(prop.name.getStart()));
        const keyEnd = document.offsetAt(document.positionAt(prop.name.getEnd()));

        if (offset >= keyStart && offset <= keyEnd + 1) {
          const existingProps = configObject.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);
          const potentialProps = ['url', 'type', 'method', 'data'];
          return potentialProps
            .filter(prop => !existingProps.includes(prop))
            .map(prop => ({
              label: prop,
              kind: CompletionItemKind.Property,
              detail: prop === 'type' || prop === 'method' ? 'HTTP метод' : undefined
            }));
        }

        // Проверяем, находится ли курсор внутри значения свойства (строкового литерала)
        if (ts.isStringLiteral(prop.initializer)) {
          const valueStart = document.offsetAt(document.positionAt(prop.initializer.getStart()));
          const valueEnd = document.offsetAt(document.positionAt(prop.initializer.getEnd()));

          // Курсор должен быть внутри кавычек
          if (offset > valueStart && offset < valueEnd) {
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
        // Проверяем, находится ли курсор внутри значения свойства (объекта для data)
        else if (propName === 'data' && ts.isObjectLiteralExpression(prop.initializer)) {
          const dataObject = prop.initializer;
          const dataStart = document.offsetAt(document.positionAt(dataObject.getStart()));
          const dataEnd = document.offsetAt(document.positionAt(dataObject.getEnd()));

          if (offset >= dataStart && offset <= dataEnd) {
            if (currentUrl && currentType && mockSwagger[currentUrl] && mockSwagger[currentUrl][currentType]) {
              const method: SwaggerMethod = mockSwagger[currentUrl][currentType];
              const bodyParam = method.parameters?.find(param => param.in === 'body');
              if (bodyParam?.schema) {
                const snippet = generateDataSnippet(bodyParam.schema);
                return [{
                  label: 'Заполнить data',
                  kind: CompletionItemKind.Snippet,
                  insertText: snippet,
                  insertTextFormat: 2 // SnippetString
                }];
              }
            }
          }
        }
      }
    }
  }

  // Если курсор находится внутри объекта конфигурации, но не над существующим свойством,
  // предлагаем все возможные свойства
  const configObjectStart = document.offsetAt(document.positionAt(configObject.getStart()));
  const configObjectEnd = document.offsetAt(document.positionAt(configObject.getEnd()));
  if (offset > configObjectStart && offset < configObjectEnd) {
    const existingProps = configObject.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);
    const potentialProps = ['url', 'type', 'method', 'data'];
    return potentialProps
      .filter(prop => !existingProps.includes(prop))
      .map(prop => ({
        label: prop,
        kind: CompletionItemKind.Property,
        detail: prop === 'type' || prop === 'method' ? 'HTTP метод' : undefined
      }));
  }

  return completions;
}

function generateDataSnippet(schema: SwaggerSchema, level: number = 1): string {
  if (schema.type === 'object' && schema.properties) {
    const indent = '  '.repeat(level);
    let snippet = '{\n';
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
    snippet += `\n${'  '.repeat(level - 1)}}`;
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
      if (!mockSwagger[url][type]) {
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
        const method: SwaggerMethod = mockSwagger[url][type];
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
                  if (!(schemaProp.type === 'integer' && propType === 'number')) { // Allow number for integer
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
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
  description?: string;
}

interface SwaggerParameter {
  in: 'query' | 'header' | 'path' | 'cookie' | 'body';
  name: string;
  required?: boolean;
  schema?: SwaggerSchema;
  description?: string;
}

interface SwaggerMethod {
  parameters?: SwaggerParameter[];
  description?: string;
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
        { in: 'query', name: 'id', schema: { type: 'number', example: 1 }, description: 'User ID' }
      ],
      description: 'Get a list of users'
    },
    post: {
      parameters: [
        {
          in: 'body',
          name: 'user',
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', example: 'john_doe', description: 'Unique username' },
              email: { type: 'string', example: 'john@example.com', description: 'User email' },
              age: { type: 'integer', example: 30, description: 'User age' },
              optionalUserInfo: { type: 'string', example: 'Some additional info', description: 'Optional user information' }
            },
            required: ['username', 'email'],
            description: 'User object to be created'
          },
          description: 'User data'
        }
      ],
      description: 'Create a new user'
    }
  },
  '/api/users/{userId}': {
    get: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user' }
      ],
      description: 'Get user by ID'
    },
    put: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user to update' },
        {
          in: 'body',
          name: 'user',
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', example: 'john_doe', description: 'Unique username' },
              email: { type: 'string', example: 'john@example.com', description: 'User email' },
              age: { type: 'integer', example: 30, description: 'User age' },
              optionalUpdateField: { type: 'string', example: 'Optional updated value', description: 'Optional field to update' }
            },
            required: [],
            description: 'Updated user object'
          },
          description: 'Updated user data'
        }
      ],
      description: 'Update a user by ID'
    },
    delete: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user to delete' }
      ],
      description: 'Delete a user by ID'
    }
  },
  '/api/users/{userId}/stats': {
    get: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user' }
      ],
      description: 'Get user statistics by ID'
    }
  },
  '/api/products': {
    get: {
      parameters: [
        { in: 'query', name: 'search', schema: { type: 'string', example: 'product name' }, description: 'Search term for products' }
      ],
      description: 'Get a list of products'
    },
    post: {
      parameters: [
        {
          in: 'body',
          name: 'product',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'New Product', description: 'Product name' },
              price: { type: 'number', example: 9.99, description: 'Product price' },
              category: { type: 'string', example: 'Electronics', description: 'Optional product category' }
            },
            required: ['name', 'price'],
            description: 'Product object to be created'
          },
          description: 'Product data'
        }
      ],
      description: 'Create a new product'
    }
  },
  '/api/products/{productId}': {
    get: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product' }
      ],
      description: 'Get product by ID'
    },
    put: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product to update' },
        {
          in: 'body',
          name: 'product',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Updated Product', description: 'Updated product name' },
              price: { type: 'number', example: 19.99, description: 'Updated product price' },
              available: { type: 'boolean', example: true, description: 'Optional availability status' }
            },
            required: [],
            description: 'Updated product object'
          },
          description: 'Updated product data'
        }
      ],
      description: 'Update a product by ID'
    },
    delete: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product to delete' }
      ],
      description: 'Delete a product by ID'
    }
  },
  '/api/products/{productId}/reviews': {
    get: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product' }
      ],
      description: 'Get reviews for a product'
    },
    post: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product' },
        {
          in: 'body',
          name: 'review',
          schema: {
            type: 'object',
            properties: {
              author: { type: 'string', example: 'Anonymous', description: 'Author of the review' },
              rating: { type: 'integer', example: 5, description: 'Rating from 1 to 5' },
              comment: { type: 'string', example: 'Great product!', description: 'Review comment' },
              imageUrls: {
                type: 'array',
                items: { type: 'string', example: 'http://example.com/image1.jpg' },
                description: 'Optional image URLs for the review'
              }
            },
            required: ['author', 'rating', 'comment'],
            description: 'Review object to be submitted'
          },
          description: 'Review data'
        }
      ],
      description: 'Submit a review for a product'
    }
  },
  '/api/orders': {
    get: {
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string', example: 'pending' }, description: 'Filter orders by status' }
      ],
      description: 'Get a list of orders'
    },
    post: {
      parameters: [
        {
          in: 'body',
          name: 'order',
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    productId: { type: 'integer', example: 1, description: 'Product ID' },
                    quantity: { type: 'integer', example: 1, description: 'Quantity' }
                  },
                  required: ['productId', 'quantity']
                },
                description: 'List of items in the order'
              },
              customerInfo: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'John Doe', description: 'Customer name' },
                  address: { type: 'string', example: '123 Main St', description: 'Customer address' },
                  phone: { type: 'string', example: '123-456-7890', description: 'Optional customer phone number' }
                },
                required: ['name', 'address'],
                description: 'Customer information'
              }
            },
            required: ['items', 'customerInfo'],
            description: 'Order object to be created'
          },
          description: 'Order data'
        }
      ],
      description: 'Create a new order'
    }
  },
  '/api/orders/{orderId}': {
    get: {
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'integer', example: 123 }, description: 'The ID of the order' }
      ],
      description: 'Get order by ID'
    },
    delete: {
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'integer', example: 123 }, description: 'The ID of the order to delete' }
      ],
      description: 'Delete an order by ID'
    }
  },
  '/api/profile': {
    get: {
      description: 'Get the current user profile'
    },
    put: {
      parameters: [
        {
          in: 'body',
          name: 'profile',
          schema: {
            type: 'object',
            properties: {
              firstName: { type: 'string', example: 'John', description: 'User first name' },
              lastName: { type: 'string', example: 'Doe', description: 'User last name' },
              phone: { type: 'string', example: '123-456-7890', description: 'User phone number' },
              website: { type: 'string', example: 'http://example.com', description: 'Optional website' }
            },
            required: ['firstName', 'lastName'],
            description: 'Updated user profile data'
          },
          description: 'User profile data'
        }
      ],
      description: 'Update the current user profile'
    }
  },
  '/api/admin/dashboard': {
    get: {
      description: 'Get data for the admin dashboard (requires admin privileges)'
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
        triggerCharacters: ['.', ':', '\'', '"', '/']
      }
      // Убрали diagnosticProvider, чтобы избежать ошибки "Unhandled method textDocument/diagnostic"
      // diagnosticProvider: {
      //   interFileDependencies: false,
      //   workspaceDiagnostics: false
      // }
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
              if (currentUrl) {
                // Для автодополнения метода, учитываем пути с параметрами
                const availableMethods: string[] = [];
                for (const swaggerUrl in mockSwagger) {
                  // Проверяем, соответствует ли текущий URL шаблону Swagger URL
                  if (isUrlMatch(swaggerUrl, currentUrl)) {
                    const methods = mockSwagger[swaggerUrl];
                    for (const method in methods) {
                      if (method !== 'description' && !availableMethods.includes(method.toUpperCase())) {
                        availableMethods.push(method.toUpperCase());
                      }
                    }
                  }
                }
                return availableMethods.map(method => ({
                  label: method,
                  kind: CompletionItemKind.Value,
                  insertText: method,
                  filterText: method
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
              // Для data, нужно найти подходящий Swagger URL с учетом параметров
              let swaggerUrlMatch: string | undefined;
              for (const swaggerUrl in mockSwagger) {
                if (isUrlMatch(swaggerUrl, currentUrl)) {
                  swaggerUrlMatch = swaggerUrl;
                  break;
                }
              }

              if (swaggerUrlMatch) {
                const method = mockSwagger[swaggerUrlMatch]?.[currentType as keyof SwaggerPath];
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
  }

  // Если курсор находится внутри объекта конфигурации, но не внутри значения,
  // предлагаем доступные свойства с двоеточием и кавычками
  const configObjectStart = document.offsetAt(document.positionAt(configObject.getStart()));
  const configObjectEnd = document.offsetAt(document.positionAt(configObject.getEnd()));

  if (offset > configObjectStart && offset < configObjectEnd) {
    const existingProps = configObject.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);
    const potentialProps = ['url', 'type', 'method', 'data', 'success', 'error', 'complete'];
    return potentialProps
      .filter(prop => !existingProps.includes(prop))
      .map(prop => {
        let insertText = `${prop}: `;
        let kind: CompletionItemKind;
        let detail: string | undefined;

        if (prop === 'url') {
          insertText += `\${1:''}`;
          detail = 'URL запроса';
          kind = CompletionItemKind.Snippet;
        } else if (prop === 'type' || prop === 'method') {
          insertText += `\${1:''}`;
          detail = 'HTTP метод';
          kind = CompletionItemKind.Snippet;
        } else if (prop === 'data') {
          insertText += `{\n\t$1\n}`;
          detail = 'Данные запроса (body)';
          kind = CompletionItemKind.Snippet;
        } else if (prop === 'success' || prop === 'error' || prop === 'complete') {
          insertText += `($1) => {\n\t$0\n}`;
          detail = `${prop} колбэк`;
          kind = CompletionItemKind.Snippet;
        }
        else {
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

// Вспомогательная функция для сопоставления URL с шаблоном Swagger URL
function isUrlMatch(swaggerUrl: string, currentUrl: string): boolean {
  const swaggerParts = swaggerUrl.split('/');
  const currentParts = currentUrl.split('/');

  if (swaggerParts.length !== currentParts.length) {
    return false;
  }

  for (let i = 0; i < swaggerParts.length; i++) {
    if (swaggerParts[i].startsWith('{') && swaggerParts[i].endsWith('}')) {
      // Это параметр пути, пропускаем проверку
      continue;
    }
    if (swaggerParts[i] !== currentParts[i]) {
      return false;
    }
  }
  return true;
}

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    if (item.data) {
      // Может быть использовано для дополнительной информации при разрешении
    }
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
    const currentUrl = urlNode.text;
    let swaggerUrlMatch: string | undefined;
    for (const swaggerUrl in mockSwagger) {
      if (isUrlMatch(swaggerUrl, currentUrl)) {
        swaggerUrlMatch = swaggerUrl;
        break;
      }
    }

    if (!swaggerUrlMatch) {
      const range = {
          start: textDocument.positionAt(urlNode.getStart() + 1),
          end: textDocument.positionAt(urlNode.getEnd() - 1)
      };
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: range,
        message: `Неизвестный URL: ${currentUrl}`,
        source: 'swagger-lsp'
      });
    } else if (typeNode) {
      const type = typeNode.text.toLowerCase();
      if (!mockSwagger[swaggerUrlMatch]?.[type as keyof SwaggerPath]) {
        const range = {
            start: textDocument.positionAt(typeNode.getStart() + 1),
            end: textDocument.positionAt(typeNode.getEnd() - 1)
        };
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: range,
          message: `Недопустимый HTTP метод '${type.toUpperCase()}' для URL: ${currentUrl}`,
          source: 'swagger-lsp'
        });
      } else if (['post', 'put', 'patch'].includes(type) && dataNode) {
        const method = mockSwagger[swaggerUrlMatch]?.[type as keyof SwaggerPath];
        if (method) {
          const bodyParam = method.parameters?.find(param => param.in === 'body');

          if (bodyParam?.schema?.properties) {
            const requiredProps = bodyParam.schema.required || [];
            const allowedProps = Object.keys(bodyParam.schema.properties);
            const dataProperties = dataNode.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);

            // Проверка на отсутствие обязательных полей
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

            // Проверка на существование полей
            for (const prop of dataNode.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                const propName = prop.name.text;
                if (!allowedProps.includes(propName)) {
                  const propRange = {
                    start: textDocument.positionAt(prop.name.getStart()),
                    end: textDocument.positionAt(prop.name.getEnd())
                  };
                  diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: propRange,
                    message: `Неизвестное поле: '${propName}'`,
                    source: 'swagger-lsp'
                  });
                } else {
                  // Пример очень простой проверки типов для существующих полей
                  const schemaProp = bodyParam.schema.properties[propName];
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
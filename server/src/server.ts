/**
 * @module server
 * @description Implements a language server for providing autocompletion and diagnostics for jQuery's $.ajax function based on a mock Swagger specification.
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  TextDocumentPositionParams,
  Diagnostic,
  TextDocumentSyncKind,
  InitializeResult
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as ts from 'typescript';
import { getAjaxCompletionItems } from './handlers/completion';
import { processAjaxConfigForDiagnostics } from './handlers/diagnostics';

// Создание соединения для языкового сервера. Используется протокол по возможностям.
const connection = createConnection(ProposedFeatures.all);

// Создание менеджера текстовых документов.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

/**
 * Обработчик события инициализации языкового сервера.
 * @param {InitializeParams} params - Параметры инициализации.
 * @returns {InitializeResult} Возможности языкового сервера.
 */
connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', ':', '\'', '"', '/']
      }
    }
  };
  return result;
});

/**
 * Обработчик события, когда языковой сервер был инициализирован.
 */
connection.onInitialized(() => {
  connection.console.log('Language server is now running!');
});

/**
 * Обработчик запроса на автодополнение.
 * @param {TextDocumentPositionParams} textDocumentPosition - Параметры позиции текстового документа.
 * @returns {Promise<CompletionItem[]>} Промис, который разрешается в массив элементов автодополнения.
 */
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

/**
 * Обработчик запроса на разрешение элемента автодополнения.
 * (В данном примере не используется, но может быть расширен для предоставления дополнительной информации).
 * @param {CompletionItem} item - Элемент автодополнения, который нужно разрешить.
 * @returns {CompletionItem} Разрешенный элемент автодополнения.
 */
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    if (item.data) {
      // Может быть использовано для дополнительной информации при разрешении
    }
    return item;
  }
);

/**
 * Обработчик изменения содержимого документа.
 * Запускает валидацию документа.
 */
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

/**
 * Обработчик открытия документа.
 * Запускает валидацию документа.
 */
documents.onDidOpen(open => {
  validateTextDocument(open.document);
});

/**
 * Выполняет валидацию текстового документа и отправляет диагностические сообщения.
 * @param {TextDocument} textDocument - Текстовый документ для валидации.
 */
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

  // Отправка диагностических сообщений клиенту
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Прослушивание событий открытия, изменения и закрытия текстовых документов.
documents.listen(connection);

// Прослушивание входящих сообщений от клиента.
connection.listen();
/**
 * @module server
 * @description Универсальный языковой сервер, использующий модули функциональности для предоставления автодополнения и диагностик.
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

import { FeatureManager } from './features/feature';
import { AjaxFeature } from './features/ajaxFeature';

// Создание соединения для языкового сервера.
const connection = createConnection(ProposedFeatures.all);

// Создание менеджера текстовых документов.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Создание и регистрация модулей функциональности
const featureManager = new FeatureManager();
featureManager.register(new AjaxFeature()); // Регистрация модуля для $.ajax

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

connection.onInitialized(() => {
  connection.console.log('Language server is now running!');
  connection.console.log(`Registered features: ${featureManager['features'].length}`);
});


/**
* Обработчик запроса на автодополнение.
* Обходит AST и запрашивает автодополнение у всех зарегистрированных модулей ICompletionFeature,
* которые применимы к текущему узлу и позиции курсора.
* @param {TextDocumentPositionParams} textDocumentPosition - Параметры позиции текстового документа.
* @returns {Promise<CompletionItem[]>} Промис, который разрешается в массив элементов автодополнения.
*/
connection.onCompletion(
  async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
      const document = documents.get(textDocumentPosition.textDocument.uri);
      if (!document) {
          return [];
      }

      const text = document.getText();
      const sourceFile = ts.createSourceFile(
          textDocumentPosition.textDocument.uri,
          text,
          ts.ScriptTarget.Latest,
          true
      );

      const allCompletions: CompletionItem[] = [];
      // Получаем только те модули, которые предоставляют автодополнение
      const completionFeatures = featureManager.getCompletionFeatures();

      // Рекурсивный обход AST документа
      ts.forEachChild(sourceFile, function visit(node) {
          // Для каждого узла в AST, проверяем все модули автодополнения
          for (const feature of completionFeatures) {
              // Если модуль "заинтересован" в этом узле (matches вернул true)
              if (feature.matches(node)) {
                  // Запрашиваем у модуля элементы автодополнения для этого узла
                  // Логика проверки позиции курсора относительно узла теперь внутри provideCompletionItems
                  const nodeCompletions = feature.provideCompletionItems(node, textDocumentPosition, document);
                  // Добавляем полученные элементы в общий список
                  allCompletions.push(...nodeCompletions);
              }
          }
          // Продолжаем обход дочерних узлов
          ts.forEachChild(node, visit);
      });

      // Возвращаем все собранные элементы автодополнения
      return allCompletions;
  }
);

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
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
* Выполняет валидацию текстового документа.
* Обходит AST и запрашивает диагностики у всех зарегистрированных модулей IDiagnosticFeature,
* которые применимы к текущему узлу.
* @param {TextDocument} textDocument - Текстовый документ для валидации.
*/
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = []; // Массив для сбора всех диагностик от всех модулей

  const sourceFile = ts.createSourceFile(
      textDocument.uri,
      text,
      ts.ScriptTarget.Latest,
      true
  );

  // Получаем только те модули, которые предоставляют диагностики
  const diagnosticFeatures = featureManager.getDiagnosticFeatures();

  // Рекурсивный обход AST документа
  ts.forEachChild(sourceFile, function visit(node) {
      // Для каждого узла в AST, проверяем все модули диагностик
      for (const feature of diagnosticFeatures) {
          // Если модуль "заинтересован" в этом узле (matches вернул true)
          if (feature.matches(node)) {
              // Запрашиваем у модуля диагностики для этого узла
              // Модуль сам добавит диагностики в переданный массив `diagnostics`
              feature.provideDiagnostics(node, textDocument, diagnostics);
          }
      }
      // Продолжаем обход дочерних узлов
      ts.forEachChild(node, visit);
  });

  // Отправка всех собранных диагностических сообщений клиенту
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Прослушивание событий открытия, изменения и закрытия текстовых документов.
documents.listen(connection);

// Прослушивание входящих сообщений от клиента.
connection.listen(); // Запуск цикла сервера
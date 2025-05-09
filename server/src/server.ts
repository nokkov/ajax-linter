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
* Использует предварительную фильтрацию модулей по типу узла для оптимизации.
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
      // Получаем карту "тип узла -> соответствующие модули"
      const nodeTypeToFeatures = featureManager.getCompletionFeaturesByNodeType();
      
      // Рекурсивный обход AST документа с оптимизированной проверкой
      ts.forEachChild(sourceFile, function visit(node) {
          const relevantFeatures = nodeTypeToFeatures.get(node.kind) || [];
          
          for (const feature of relevantFeatures) {
              // Дополнительная проверка на соответствие, если требуется
              if (feature.matches(node)) {
                  const nodeCompletions = feature.provideCompletionItems(node, textDocumentPosition, document);
                  allCompletions.push(...nodeCompletions);
              }
          }
          
          // Продолжаем обход дочерних узлов
          ts.forEachChild(node, visit);
      });

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
* Использует предварительную фильтрацию модулей по типу узла для оптимизации.
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

  // Получаем карту "тип узла -> соответствующие модули"
  const nodeTypeToFeatures = featureManager.getDiagnosticFeaturesByNodeType();
  
  // Рекурсивный обход AST документа
  ts.forEachChild(sourceFile, function visit(node) {
      const relevantFeatures = nodeTypeToFeatures.get(node.kind) || [];
      
      for (const feature of relevantFeatures) {
          if (feature.matches(node)) {
              feature.provideDiagnostics(node, textDocument, diagnostics);
          }
      }
      
      // Продолжаем обход дочерних узлов
      ts.forEachChild(node, visit);
  });

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Прослушивание событий открытия, изменения и закрытия текстовых документов.
documents.listen(connection);

// Прослушивание входящих сообщений от клиента.
connection.listen();
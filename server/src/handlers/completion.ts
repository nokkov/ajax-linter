import {
  TextDocuments,
  TextDocument,
  CompletionItem,
  TextDocumentPositionParams,
  Connection
} from 'vscode-languageserver/node';

import {
  extractUrl,
  getAjaxPropertyCompletions,
  getUrlCompletions,
  getHttpMethodCompletions,
  getCompletionsByContext
} from '../utils/completionUtils';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * Регистрирует провайдер автодополнения для AJAX-запросов
 * @param connection Подключение к LSP-серверу
 * @param documents Менеджер текстовых документов
 */
// FIXME: разделить логику регистрации и автодополнения
// FIXME: как сделать так, чтобы автокомплит срабатывал автоматически без вызова триггера?
function registerCompletion(connection: Connection, documents: TextDocuments<TextDocument>) {
  connection.onCompletion(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc) return null;
    
    try {
      const ast = parse(doc.getText(), {
        sourceType: 'module',
        plugins: ['typescript']
      });

      let isInAjax = false;
      let currentProperty = null;

      traverse(ast, { 
        CallExpression(path) {
          if (
            path.node.callee.type === 'MemberExpression' &&
            path.node.callee.property.type === 'Identifier' &&
            path.node.callee.property.name === 'ajax'
          ) {
            isInAjax = true;
          }
        },
        Property(path) {
          if (!isInAjax) return;
          if (path.node.key.type === 'Identifier') {
            currentProperty = path.node.key.name;
          }
        }
      });

      if (!isInAjax) return null;

      const lineText = doc.getText({
        start: { line: position.line, character: 0 },
        end: position
      });

      return {
        isIncomplete: false,
        items: getCompletionsByContext(currentProperty, lineText)
      };

    } catch {
      return null; //в случае ошибки парсинга не возвращать сниппеты
    }
  })
}

export {registerCompletion};
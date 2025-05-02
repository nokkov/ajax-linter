import {
  TextDocuments,
  TextDocument,
  Connection,
  CompletionList
} from 'vscode-languageserver/node';

import {
  getCompletionsByContext
} from '../utils/completionUtils';

import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import { Node } from '@babel/types';

/**
 * Проверяет, находится ли позиция курсора в пределах данного узла AST.
 * @param position Позиция курсора
 * @param node Узел AST
 * @returns true, если позиция находится внутри узла, иначе false
 */
function isPositionWithin(position: { line: number, character: number }, node: Node): boolean {
  if (!node.loc) return false;
  const startLine = node.loc.start.line - 1; // Перевод из 1-based в 0-based
  const endLine = node.loc.end.line - 1;     // Перевод из 1-based в 0-based
  const startChar = node.loc.start.column;
  const endChar = node.loc.end.column;

  if (position.line < startLine || position.line > endLine) {
    return false;
  }
  if (position.line === startLine && position.character < startChar) {
    return false;
  }
  if (position.line === endLine && position.character > endChar) {
    return false;
  }
  return true;
}

/**
 * Регистрирует провайдер автодополнения для AJAX-запросов
 * @param connection Подключение к LSP-серверу
 * @param documents Менеджер текстовых документов
 */
function registerCompletion(connection: Connection, documents: TextDocuments<TextDocument>) {
  connection.onCompletion(({ textDocument, position }): CompletionList | null => {
    const doc = documents.get(textDocument.uri);
    if (!doc) return null;

    try {
      const ast = parse(doc.getText(), {
        sourceType: 'module',
        plugins: ['typescript']
      });

      let currentProperty: string | null = null;
      let isInAjaxCall = false;

      traverse(ast, {
        CallExpression(path) {
          if (
            path.node.callee.type === 'MemberExpression' &&
            path.node.callee.property.type === 'Identifier' &&
            path.node.callee.property.name === 'ajax'
          ) {
            if (isPositionWithin(position, path.node)) {
              isInAjaxCall = true;
            }
          }
        },
        Property(path) {
          if (!isInAjaxCall) return; // Пропускаем, если не в блоке $.ajax

          // Дополнительная проверка, чтобы убедиться, что Property находится внутри CallExpression
          let parent: NodePath<any> | null = path.parentPath;
          let insideAjaxCall = false;
          while (parent) {
            if (
              parent.node.type === 'CallExpression' &&
              (parent.node.callee.type === 'MemberExpression' &&
                parent.node.callee.property.type === 'Identifier' &&
                parent.node.callee.property.name === 'ajax')
            ) {
              insideAjaxCall = true;
              break;
            }
            parent = parent.parentPath;
          }

          if (insideAjaxCall && path.node.key.type === 'Identifier') {
            currentProperty = path.node.key.name;
          }
        }
      });

      if (!isInAjaxCall) {
        return null;
      }

      const lineText = doc.getText({
        start: { line: position.line, character: 0 },
        end: position
      });

      return {
        isIncomplete: false,
        items: getCompletionsByContext(currentProperty, lineText)
      };

    } catch (e) {
      console.error("Error during AST parsing or traversal:", e);
      return null; // в случае ошибки парсинга не возвращать сниппеты
    }
  });
}

export { registerCompletion };
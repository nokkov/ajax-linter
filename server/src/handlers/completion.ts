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
import * as t from '@babel/types';

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

      let completions: CompletionList | null = null;

      traverse(ast, {
        CallExpression(path) {
          if (
            path.node.callee.type === 'MemberExpression' &&
            path.node.callee.property.type === 'Identifier' &&
            path.node.callee.property.name === 'ajax'
          ) {
            if (isPositionWithin(position, path.node)) {
              const ajaxArgs = path.node.arguments;
              if (ajaxArgs.length > 0 && ajaxArgs[0].type === 'ObjectExpression') {
                const properties = ajaxArgs[0].properties;
                let currentProperty: string | null = null;
                let rawUrl: string | null = null;

                for (const prop of properties) {
                  if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                    if (isPositionWithin(position, prop)) {
                      currentProperty = prop.key.name;
                    }
                    if (prop.key.name === 'url' && prop.value.type === 'StringLiteral') {
                      rawUrl = prop.value.value;
                    }
                  }
                }

                const lineText = doc.getText({
                  start: { line: position.line, character: 0 },
                  end: position
                });

                completions = getCompletionsByContext(currentProperty, lineText, rawUrl);
              }
            }
          }
        }
      });

      return completions;

    } catch (e) {
      console.error("Error during AST parsing or traversal:", e);
      return null; // в случае ошибки парсинга не возвращать сниппеты
    }
  });
}

export { registerCompletion };
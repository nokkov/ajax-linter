/**
 * @module completionProvider
 * @description Provides completion items for the $.ajax function based on a mock Swagger specification.
 */

import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  InsertTextFormat,
  Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as ts from 'typescript';
import { generateDataSnippet, getDefaultValue, getMatchingSwaggerUrl } from '../utils/utils';
import { mockSwagger, SwaggerPath } from '../types/swagger';

/**
 * Provides completion items for the properties of the $.ajax configuration object.
 * @param {ts.ObjectLiteralExpression} configObject - The object literal representing the $.ajax configuration.
 * @param {TextDocumentPositionParams} textDocumentPosition - The parameters for the completion request.
 * @param {TextDocument} document - The text document.
 * @returns {CompletionItem[]} An array of completion items.
 */
export function getAjaxCompletionItems(configObject: ts.ObjectLiteralExpression, textDocumentPosition: TextDocumentPositionParams, document: TextDocument): CompletionItem[] {
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
                const swaggerUrlMatch = getMatchingSwaggerUrl(currentUrl);
                if (swaggerUrlMatch) {
                  const methods = mockSwagger[swaggerUrlMatch];
                  for (const method in methods) {
                    if (method !== 'description' && !availableMethods.includes(method.toUpperCase())) {
                      availableMethods.push(method.toUpperCase());
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
              const swaggerUrlMatch = getMatchingSwaggerUrl(currentUrl);

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
  // предлагаем доступные свойства с двоеточием
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
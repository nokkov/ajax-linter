/**
 * @module diagnosticsProvider
 * @description Provides diagnostic messages (errors and warnings) for the $.ajax function based on a mock Swagger specification.
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as ts from 'typescript';
import { mockSwagger, SwaggerPath } from '../types/swagger';
import { getMatchingSwaggerUrl, getNodeType } from '../utils/utils';

/**
 * Processes the $.ajax configuration object and generates diagnostic messages.
 * @param {ts.ObjectLiteralExpression} configObject - The object literal representing the $.ajax configuration.
 * @param {TextDocument} textDocument - The text document.
 * @param {Diagnostic[]} diagnostics - The array to which diagnostic messages will be added.
 */
export function processAjaxConfigForDiagnostics(configObject: ts.ObjectLiteralExpression, textDocument: TextDocument, diagnostics: Diagnostic[]) {
  let urlNode: ts.StringLiteral | undefined;
  let typeNode: ts.StringLiteral | undefined;
  let dataNode: ts.ObjectLiteralExpression | undefined;

  const encounteredProps = new Set<string>();

  for (const prop of configObject.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;

        if (encounteredProps.has(propName)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: textDocument.positionAt(prop.name.getStart()),
              end: textDocument.positionAt(prop.name.getEnd())
            },
            message: `Дублирующееся свойство: '${propName}'`,
            source: 'swagger-lsp'
          });
        }
        encounteredProps.add(propName);

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
    const swaggerUrlMatch = getMatchingSwaggerUrl(currentUrl);

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
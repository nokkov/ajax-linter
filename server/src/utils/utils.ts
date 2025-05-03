/**
 * @module utils
 * @description Contains utility functions used across the language server.
 */

import * as ts from 'typescript';
import { mockSwagger, SwaggerSchema } from '../types/swagger';

/**
 * Gets the default value for a given Swagger schema type.
 * @param {string | undefined} type - The Swagger schema type.
 * @returns {string} The default value as a string.
 */
export function getDefaultValue(type?: string): string {
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

/**
 * Generates a snippet for data based on a Swagger schema.
 * @param {SwaggerSchema} schema - The Swagger schema for the data.
 * @param {number} level - The current indentation level.
 * @param {boolean} includeBraces - Whether to include the surrounding braces for an object.
 * @returns {string} The generated data snippet.
 */
export function generateDataSnippet(schema: SwaggerSchema, level: number = 1, includeBraces: boolean = true): string {
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
        snippet += `${indent}    ${generateDataSnippet(prop.items, level + 2, false)}`;
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
  if (schema.type === 'array' && schema.items) {
    return `[\n${'  '.repeat(level)}${generateDataSnippet(schema.items, level + 1, false)}\n${'  '.repeat(level - 1)}]`;
  }
  return schema.example !== undefined ? JSON.stringify(schema.example) : getDefaultValue(schema.type);
}

/**
 * Gets the corresponding Swagger URL pattern for a given current URL, considering path parameters.
 * @param {string} currentUrl - The current URL entered by the user.
 * @returns {string | undefined} The matching Swagger URL pattern, or `undefined` if no match is found.
 */
export function getMatchingSwaggerUrl(currentUrl: string): string | undefined {
  const currentParts = currentUrl.split('/').filter(part => part !== '');
  for (const swaggerUrl in mockSwagger) {
    const swaggerParts = swaggerUrl.split('/').filter(part => part !== '');

    if (swaggerParts.length !== currentParts.length) {
      continue;
    }

    let match = true;
    for (let i = 0; i < swaggerParts.length; i++) {
      if (swaggerParts[i].startsWith('{') && swaggerParts[i].endsWith('}')) {
        // Это параметр пути в Swagger URL, проверяем, что в текущем URL есть что-то на этой позиции
        if (currentParts[i] === '') {
          match = false;
          break;
        }
      } else {
        // Это не параметр, части должны совпадать точно
        if (swaggerParts[i] !== currentParts[i]) {
          match = false;
          break;
        }
      }
    }

    if (match) {
      return swaggerUrl;
    }
  }
  return undefined;
}

/**
 * Determines the type of a TypeScript node.
 * @param {ts.Expression} node - The TypeScript expression node.
 * @returns {string | undefined} The type of the node ('string', 'number', 'boolean', 'array', 'object', 'integer'), or `undefined` if the type is not recognized.
 */
export function getNodeType(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node)) {
    return 'string';
  } else if (ts.isNumericLiteral(node)) {
    const text = node.getText();
    return text.includes('.') ? 'number' : 'integer';
  } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return 'boolean';
  } else if (ts.isArrayLiteralExpression(node)) {
    return 'array';
  } else if (ts.isObjectLiteralExpression(node)) {
    return 'object';
  }
  return undefined;
}
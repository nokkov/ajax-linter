/**
 * @module utils
 * @description Содержит вспомогательные функции, используемые модулями функциональности языкового сервера.
 */

import * as ts from 'typescript';
import { mockSwagger, SwaggerSchema } from '../types/swagger';

/**
 * Получает строковое представление значения по умолчанию для заданного типа из схемы Swagger.
 * Используется при генерации сниппетов для автодополнения.
 * @param {string | undefined} type - Тип из схемы Swagger.
 * @returns {string} Значение по умолчанию в виде строки (например, '""', '0', 'true').
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
 * Генерирует сниппет (фрагмент кода с плейсхолдерами) для данных (тела запроса)
 * на основе схемы Swagger. Используется модулями функциональности автодополнения.
 * @param {SwaggerSchema} schema - Схема Swagger для данных.
 * @param {number} level - Текущий уровень отступа (для форматирования сниппета).
 * @param {boolean} includeBraces - Включать ли окружающие фигурные скобки для объекта (для вложенных объектов).
 * @returns {string} Сгенерированный сниппет данных.
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
        // Предполагаем, что items - это один тип схемы
        snippet += `${indent}    ${generateDataSnippet(prop.items, level + 2, false)}`;
        snippet += `\n${indent}  ]`;
      } else {
        snippet += `\${${i++}:${prop.example !== undefined ? JSON.stringify(prop.example) : getDefaultValue(prop.type)}}`;
      }
      snippet += `${isRequired ? '' : '?'},\n`;
    }
    snippet = snippet.replace(/,\n$/, '\n'); // Удаляем последнюю запятую перед закрывающей скобкой
    snippet += includeBraces ? `\n${'  '.repeat(level - 1)}}` : '';
    return snippet;
  }
    // Добавлена обработка корневого массива
  if (schema.type === 'array' && schema.items) {
       // Здесь предполагается, что items - это один тип схемы
       // Уровень отступа для элементов массива внутри скобок
       const itemLevel = includeBraces ? level + 1 : level;
       let snippet = includeBraces ? '[\n' : '';
       snippet += `${'  '.repeat(itemLevel)}${generateDataSnippet(schema.items, itemLevel + 1, false)}`;
       snippet += `\n${'  '.repeat(includeBraces ? level : level - 1)}]`;
       return snippet;
   }
    // Возвращаем дефолтное значение или пример для примитивных типов на любом уровне
  return schema.example !== undefined ? JSON.stringify(schema.example) : getDefaultValue(schema.type);
}


/**
 * Получает соответствующий шаблон URL из Swagger для заданного текущего URL, учитывая параметры пути.
 * Используется модулями функциональности (например, AjaxFeature) для сопоставления URL из кода со спецификацией.
 * @param {string} currentUrl - Текущий URL, введенный пользователем.
 * @returns {string | undefined} Соответствующий шаблон URL из Swagger или `undefined`, если совпадение не найдено.
 */
export function getMatchingSwaggerUrl(currentUrl: string): string | undefined {
  // Удаляем ведущие/завершающие слеши и разбиваем на части
  const currentParts = currentUrl.split('/').filter(part => part !== '');

  // Перебираем все URL-шаблоны в mockSwagger
  for (const swaggerUrl in mockSwagger) {
    // Удаляем ведущие/завершающие слеши и разбиваем шаблон на части
    const swaggerParts = swaggerUrl.split('/').filter(part => part !== '');

    // Если количество частей в текущем URL и шаблоне не совпадает, это не совпадение
    if (swaggerParts.length !== currentParts.length) {
      continue;
    }

    let match = true;
    // Попарно сравниваем части URL
    for (let i = 0; i < swaggerParts.length; i++) {
      // Проверяем, является ли часть шаблона параметром пути (например, "{id}")
      if (swaggerParts[i].startsWith('{') && swaggerParts[i].endsWith('}')) {
        // Это параметр пути в Swagger URL. Считаем, что совпадение есть, если
        // соответствующая часть в текущем URL не пустая.
        if (currentParts[i] === '') {
          match = false; // Параметр пути не может быть пустым
          break;
        }
      } else {
        // Это не параметр, части должны совпадать точно (с учетом регистра)
        if (swaggerParts[i] !== currentParts[i]) {
          match = false; // Части не совпадают
          break;
        }
      }
    }

    // Если после проверки всех частей совпадение найдено, возвращаем шаблон Swagger URL
    if (match) {
      return swaggerUrl;
    }
  }
  // Если ни один шаблон не совпал
  return undefined;
}

/**
 * Определяет предполагаемый тип узла TypeScript для простого значения (строка, число, булево и т.п.).
 * Используется модулями функциональности диагностик (например, AjaxFeature)
 * для базовой проверки соответствия типов значений в коде схеме Swagger.
 * @param {ts.Expression} node - Узел выражения TypeScript (например, значение свойства в объекте).
 * @returns {string | undefined} Предполагаемый тип узла ('string', 'number', 'boolean', 'array', 'object', 'integer') или `undefined`, если тип не распознан.
 */
export function getNodeType(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node)) {
    return 'string';
  } else if (ts.isNumericLiteral(node)) {
    const text = node.getText();
    // Простая эвристика: если есть точка, считаем number, иначе integer
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
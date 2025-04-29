/**
 * Модуль для работы с Swagger-подсказками
 * @module SwaggerCompletions
 * @description Содержит функции для автодополнения URL и методов API
 */

import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat
  } from 'vscode-languageserver/node';
  
import { mockSwagger } from '../types/mockSwagger';

/**
 * Извлекает URL из строки формата url: '/some/url'
 * @param {string} text - Строка для анализа
 * @returns {string|undefined} Извлеченный URL или undefined, если не найден
 * @example
 * const url = extractUrl('url: "/api/users"'); // возвращает "/api/users"
 */
function extractUrl(text: string): string | undefined {
  const match = text.match(/url:\s*['"]([^'"]*)['"]?/);
  return match?.[1];
}
 
/**
 * Проверяет, находится ли текущая позиция внутри блока $.ajax({})
 * @param {string} text - Текст для анализа
 * @returns {boolean} true если находимся внутри не закрытого блока $.ajax
 * @example
 * const inside = isInsideAjaxBlock('$.ajax({ url: "/api" });'); // false
 * const inside = isInsideAjaxBlock('$.ajax({ url: "/api"'); // true
 */
//FIXME избавиться от этой функции
function isInsideAjaxBlock(text: string): boolean {
  //FIXME а если будет несколько вызовов ajax в одном файле?
  const ajaxIndex = text.lastIndexOf('$.ajax({');
  if (ajaxIndex === -1) return false;

  const afterAjax = text.slice(ajaxIndex);
  const openBraces = (afterAjax.match(/{/g) || []).length;
  const closeBraces = (afterAjax.match(/}/g) || []).length;

  return openBraces > closeBraces;
}

/**
 * Возвращает предложения для автодополнения свойств AJAX-запроса
 * @returns {CompletionItem[]} Массив элементов автодополнения для свойств AJAX
 * @example
 * const completions = getAjaxPropertyCompletions();
 * // возвращает [ { label: 'url', ... }, { label: 'type', ... } ]
 */
function getAjaxPropertyCompletions(): CompletionItem[] {
  return [
    {
      label: 'url',
      kind: CompletionItemKind.Snippet,
      documentation: 'URL для AJAX-запроса',
      insertText: 'url: ${1}',
      insertTextFormat: InsertTextFormat.Snippet
    },
    {
      label: 'type',
      kind: CompletionItemKind.Snippet,
      documentation: 'HTTP метод (GET, POST, etc.)',
      insertText: 'type: ${1}',
      insertTextFormat: InsertTextFormat.Snippet
    }
  ];
}

/**
 * Возвращает все URL из mockSwagger в виде элементов автодополнения
 * @returns {CompletionItem[]} Массив URL для автодополнения
 * @example
 * const urls = getUrlCompletions();
 * // возвращает [ { label: '/api/users', ... }, ... ]
 */
function getUrlCompletions(): CompletionItem[] {
  return Object.keys(mockSwagger).map(url => ({
    label: url,
    kind: CompletionItemKind.Value,
    insertText: url
  }));
}

/**
 * Возвращает доступные HTTP-методы для указанного URL
 * @param {string} selectedUrl - URL для которого нужно получить методы
 * @returns {CompletionItem[]} Массив методов для автодополнения
 * @example
 * const methods = getHttpMethodCompletions('/api/users');
 * // возвращает [ { label: 'GET', ... }, { label: 'POST', ... } ]
 */
function getHttpMethodCompletions(selectedUrl: string): CompletionItem[] {
  const methods = mockSwagger[selectedUrl] ?? {};
  return Object.keys(methods).map(method => ({
    label: method.toUpperCase(),
    kind: CompletionItemKind.Value,
    insertText: method.toUpperCase()
  }));
}

//FIXME: убрать этот костыль
function findMatchingSwaggerUrl(url: string, swaggerSpec: Record<string, any>): string | null {
  for (const specUrl of Object.keys(swaggerSpec)) {
    const regexPattern = specUrl
      .replace(/{[^/{}]+}/g, '[^/]+') // заменяет {param} на [^/]+
      .replace(/\//g, '\\/');         // экранирует / для RegExp

    const fullRegex = new RegExp(`^${regexPattern}$`);

    if (fullRegex.test(url)) {
      return specUrl;
    }
  }
  return null;
}

function getCompletionsByContext(property: string | null, lineText: string) {
  if (property === 'url' && /['"][^'"]*$/.test(lineText)) {
    return getUrlCompletions();
  }
  if (property === 'type' && /['"][^'"]*$/.test(lineText)) {
    //FIXME: здесь нужна обработка методов с параметрами 
    return getHttpMethodCompletions(selectedUrl ?? '');
  }
  return getAjaxPropertyCompletions();
}

export {
  extractUrl,
  isInsideAjaxBlock,
  getAjaxPropertyCompletions,
  getUrlCompletions,
  getHttpMethodCompletions,
  findMatchingSwaggerUrl,
  getCompletionsByContext
};
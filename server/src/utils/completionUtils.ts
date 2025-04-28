import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat
  } from 'vscode-languageserver/node';
  
import { mockSwagger } from '../types/mockSwagger';
  
export function extractUrl(text: string): string | undefined {
const match = text.match(/url:\s*['"]([^'"]*)['"]?/);
return match?.[1];
}
  
export function isInsideAjaxBlock(text: string): boolean {
  const ajaxIndex = text.lastIndexOf('$.ajax({');
  if (ajaxIndex === -1) return false;

  const afterAjax = text.slice(ajaxIndex);
  const openBraces = (afterAjax.match(/{/g) || []).length;
  const closeBraces = (afterAjax.match(/}/g) || []).length;

  return openBraces > closeBraces;
}
  
export function getAjaxPropertyCompletions(): CompletionItem[] {
  return [
    {
      label: 'url',
      kind: CompletionItemKind.Property,
      detail: 'string',
      documentation: 'URL для AJAX-запроса',
      insertText: 'url: \'${1}\',',
      insertTextFormat: InsertTextFormat.Snippet
    },
    {
      label: 'type',
      kind: CompletionItemKind.Property,
      detail: 'string',
      documentation: 'HTTP метод (GET, POST, etc.)',
      insertText: 'type: \'${1}\',',
      insertTextFormat: InsertTextFormat.Snippet
    }
  ];
}
  
export function getUrlCompletions(): CompletionItem[] {
  return Object.keys(mockSwagger).map(url => ({
    label: url,
    kind: CompletionItemKind.Value,
    documentation: getMethodsDoc(url),
    insertText: url
  }));
}
  
export function getHttpMethodCompletions(selectedUrl?: string): CompletionItem[] {
  if (selectedUrl && mockSwagger[selectedUrl]) {
    return Object.keys(mockSwagger[selectedUrl]).map(method => ({
      label: method.toUpperCase(),
      kind: CompletionItemKind.Value,
      documentation: mockSwagger[selectedUrl][method]?.summary || '',
      insertText: `${method.toUpperCase()}`
    }));
  }

  return getAllHttpMethods().map(method => ({
    label: method,
    kind: CompletionItemKind.Value,
    documentation: '',
    insertText: `'${method}'`
  }));
}

function getMethodsDoc(url: string): string {
  const methods = Object.keys(mockSwagger[url]);
  return methods
    .map(method => `${method.toUpperCase()}: ${mockSwagger[url][method]?.summary || 'No description'}`)
    .join('\n');
}
  
function getAllHttpMethods(): string[] {
  const methodSet = new Set<string>();
  Object.values(mockSwagger).forEach(path =>
    Object.keys(path).forEach(method => methodSet.add(method.toUpperCase()))
  );
  return Array.from(methodSet);
}

// Функция для сопоставления url с параметрами: /users/{id} или /users/{id}/links
export function findMatchingSwaggerUrl(url: string, swaggerSpec: Record<string, any>): string | null {
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
  
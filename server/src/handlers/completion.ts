import {
  TextDocuments,
  TextDocument,
  CompletionItem,
  TextDocumentPositionParams,
  Connection
} from 'vscode-languageserver/node';

import {
  extractUrl,
  isInsideAjaxBlock,
  getAjaxPropertyCompletions,
  getUrlCompletions,
  getHttpMethodCompletions
} from '../utils/completionUtils';

export function registerCompletion(
  connection: Connection,
  documents: TextDocuments<TextDocument>
) {
  connection.onCompletion((params: TextDocumentPositionParams) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const pos = params.position;
    const lineText = doc.getText({
      start: { line: pos.line, character: 0 },
      end: pos
    });

    const fullTextBeforeCursor = doc.getText({
      start: { line: 0, character: 0 },
      end: pos
    });

    const selectedUrl = extractUrl(fullTextBeforeCursor);

    const items: CompletionItem[] = [];

    // Фильтрация: работаем только внутри $.ajax({})
    if (isInsideAjaxBlock(fullTextBeforeCursor)) {
      // Автодополнение для 'url' внутри кавычек
      if (/url:\s*['"][^'"]*$/.test(lineText)) {
        items.push(...getUrlCompletions());
      }
      // Автодополнение для 'type' внутри кавычек
      else if (/type:\s*['"][^'"]*$/.test(lineText)) {
        items.push(...getHttpMethodCompletions(selectedUrl));
      }
      // В остальных случаях (url: '', type: '') — показываем общие свойства
      else {
        items.push(...getAjaxPropertyCompletions());
      }
    }

    return {
      isIncomplete: false,
      items
    };
  });
}
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentPositionParams,
  DiagnosticSeverity
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

function isInsideAjaxBlock(textBeforeCursor: string): boolean {
  const ajaxStart = textBeforeCursor.lastIndexOf("$.ajax({");
  const blockOpen = textBeforeCursor.lastIndexOf("{", ajaxStart);
  const blockClose = textBeforeCursor.lastIndexOf("}", ajaxStart);
  return ajaxStart !== -1 && (blockClose === -1 || blockClose < ajaxStart);
}

connection.onInitialize((params: InitializeParams) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        //FIXME
        triggerCharacters: ['.', '/']
      }
    }
  };
});

//FIXME
interface SwaggerPath {
  [path: string]: {
    [method: string]: {
      summary?: string;
      parameters?: Array<{
        name: string;
        in: string;
        type: string;
      }>;
    };
  };
}

//FIXME
const mockSwagger: SwaggerPath = {
  '/api/data': {
    'get': {
      summary: 'Get data',
      parameters: [
        { name: 'id', in: 'query', type: 'string' }
      ]
    }
  },
  '/api/users': {
    'post': {
      summary: 'Create user'
    },
    'get': {
      summary: 'Get users'
    }
  }
};

documents.onDidChangeContent(change => {
  const doc = change.document;
  const text = doc.getText();

  const diagnostics = [];

  // Найти все вхождения url: '...'
  const urlRegex = /url:\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[1];
    const index = match.index;

    if (!mockSwagger[url]) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: doc.positionAt(index),
          end: doc.positionAt(index + match[0].length)
        },
        message: `URL "${url}" не найден в спецификации Swagger.`,
        source: 'mockSwagger' //FIXME
      });
    } else {
      const methodsMatch = text.match(/type:\s*['"]([^'"]+)['"]/);
      if (methodsMatch && methodsMatch[1]) {
        const method = methodsMatch[1].toUpperCase();
        if (!mockSwagger[url][method.toLowerCase()]) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: doc.positionAt(match.index),
              end: doc.positionAt(match.index + match[0].length)
            },
            message: `Метод "${method}" не поддерживается для URL "${url}".`,
            source: 'mockSwagger'
          });
        }
      }
    }
  }

  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
});

connection.onCompletion((textDocumentPosition: TextDocumentPositionParams) => {
  const doc = documents.get(textDocumentPosition.textDocument.uri);
  if (!doc) return null;

  const pos = textDocumentPosition.position;
  const line = doc.getText({
    start: { line: pos.line, character: 0 },
    end: pos
  });

  const fullTextBeforeCursor = doc.getText({
    start: { line: 0, character: 0 },
    end: pos
  });

  const urlMatch = fullTextBeforeCursor.match(/url:\s*['"]([^'"]*)['"]?/);
  const selectedUrl = urlMatch?.[1];

  let items = [];

  // Проверяем, находимся ли мы внутри $.ajax({ ... })
  if (isInsideAjaxBlock(fullTextBeforeCursor)) {
    items.push(
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
    );
  }

  // Если курсор находится в строке с url: '...'
  if (/url:\s*['"][^'"]*$/.test(line)) {
    const urls = Object.keys(mockSwagger);
    items = urls.map(url => {
      const methods = Object.keys(mockSwagger[url]);
      const docText = methods
        .map(m => `${m.toUpperCase()}: ${mockSwagger[url][m]?.summary || 'No description'}`)
        .join('\n');

      return {
        label: url,
        kind: CompletionItemKind.Value,
        documentation: docText,
        insertText: url
      };
    });
  }

  // Если курсор находится в строке с type: '...'
  if (/type:\s*['"][^'"]*$/.test(line)) {
    if (selectedUrl && mockSwagger[selectedUrl]) {
      const methods = Object.keys(mockSwagger[selectedUrl]);
      items = methods.map(method => ({
        label: method.toUpperCase(),
        kind: CompletionItemKind.Value,
        documentation: mockSwagger[selectedUrl][method]?.summary || '',
        insertText: `'${method.toUpperCase()}'`
      }));
    } else {
      const allMethods = new Set<string>();
      Object.values(mockSwagger).forEach(path => {
        Object.keys(path).forEach(method => allMethods.add(method.toUpperCase()));
      });
      items = Array.from(allMethods).map(method => ({
        label: method,
        kind: CompletionItemKind.Value,
        documentation: '',
        insertText: `'${method}'`
      }));
    }
  }

  return {
    isIncomplete: false,
    items
  };
});


documents.listen(connection);
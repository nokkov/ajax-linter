import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
} from "vscode-languageserver/node";

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { TextDocument } from "vscode-languageserver-textdocument";

const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '/']
      }
    }
  };
  return result;
});

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
    }
  }
};

connection.onCompletion((textDocumentPosition) => {
  const doc = documents.get(textDocumentPosition.textDocument.uri);
  if (!doc) return null;

  const text = doc.getText();
  const pos = textDocumentPosition.position;
  const line = doc.getText({
    start: { line: pos.line, character: 0 },
    end: pos
  });

  if (line.includes('$.ajax({')) {
    return {
      isIncomplete: false,
      items: [
        {
          label: 'url',
          kind: 10, 
          detail: 'string',
          documentation: 'URL для AJAX-запроса',
          insertText: 'url: \'${1}\','
        },
        {
          label: 'type',
          kind: 10,
          detail: 'string',
          documentation: 'HTTP метод (GET, POST, etc.)',
          insertText: 'type: \'${1|GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS,TRACE|}\','
        },
      ]
    };
  }

  if (line.includes('url: \'')) {
    const urls = Object.keys(mockSwagger);
    return {
      isIncomplete: false,
      items: urls.map(url => {
        const methods = mockSwagger[url] ? Object.keys(mockSwagger[url]) : [];
        const firstMethod = methods.length > 0 ? methods[0] : undefined;
        const summary = firstMethod ? mockSwagger[url][firstMethod]?.summary : undefined;
        
        return {
          label: url,
          kind: 12, // Value
          documentation: summary || 'No description',
          insertText: url
        };
      })
    };
  }

  return null;
});



documents.listen(connection);
connection.listen();
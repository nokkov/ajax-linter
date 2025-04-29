import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { registerCompletion } from "./handlers/completion";
import { registerDiagnostics } from "./handlers/diagnostics";

export const connection = createConnection(ProposedFeatures.all);
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

//TODO: сделать триггер по положению курсора в документе
connection.onInitialize((params) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [':', "'", '"']
      }
    }
  };
});

registerCompletion(connection, documents);
registerDiagnostics(connection, documents);

documents.listen(connection);
connection.listen();
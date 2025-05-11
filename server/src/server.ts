import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  TextDocumentPositionParams,
  Diagnostic,
  TextDocumentSyncKind,
  InitializeResult
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as ts from 'typescript';

import { FeatureManager } from './features/feature';
import { AjaxFeature } from './features/ajaxFeature';

const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const featureManager = new FeatureManager();
featureManager.register(new AjaxFeature());

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
      capabilities: {
          textDocumentSync: TextDocumentSyncKind.Full,
          completionProvider: {
              resolveProvider: true,
              triggerCharacters: ['.', ':', '\'', '"', '/']
          }
      }
  };

  return result;
});

connection.onInitialized(() => {
  connection.console.log('Language server is now running!');
  connection.console.log(`Registered features: ${featureManager['features'].length}`);
});

connection.onCompletion(
  async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
      const document = documents.get(textDocumentPosition.textDocument.uri);
      if (!document) {
          return [];
      }

      const text = document.getText();
      const sourceFile = ts.createSourceFile(
          textDocumentPosition.textDocument.uri,
          text,
          ts.ScriptTarget.Latest,
          true
      );

      const allCompletions: CompletionItem[] = [];
      const nodeTypeToFeatures = featureManager.getCompletionFeaturesByNodeType();
      
      ts.forEachChild(sourceFile, function visit(node) {
          const relevantFeatures = nodeTypeToFeatures.get(node.kind) || [];
          
          for (const feature of relevantFeatures) {
              if (feature.matches(node)) {
                  const nodeCompletions = feature.provideCompletionItems(node, textDocumentPosition, document);
                  allCompletions.push(...nodeCompletions);
              }
          }
          
          ts.forEachChild(node, visit);
      });

      return allCompletions;
  }
);

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
      return item;
  }
);

documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

documents.onDidOpen(open => {
  validateTextDocument(open.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const sourceFile = ts.createSourceFile(
      textDocument.uri,
      text,
      ts.ScriptTarget.Latest,
      true
  );

  const nodeTypeToFeatures = featureManager.getDiagnosticFeaturesByNodeType();
  
  ts.forEachChild(sourceFile, function visit(node) {
      const relevantFeatures = nodeTypeToFeatures.get(node.kind) || [];
      
      for (const feature of relevantFeatures) {
          if (feature.matches(node)) {
              feature.provideDiagnostics(node, textDocument, diagnostics);
          }
      }
      
      ts.forEachChild(node, visit);
  });

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

documents.listen(connection);

connection.listen();
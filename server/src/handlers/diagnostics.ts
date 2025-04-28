import {
  Connection,
  DiagnosticSeverity,
  TextDocument,
  TextDocuments,
} from "vscode-languageserver/node";

import { mockSwagger } from "../types/mockSwagger";

export function registerDiagnostics(
  connection: Connection,
  documents: TextDocuments<TextDocument>
) {
  documents.onDidChangeContent(change => {
    const doc = change.document;
    const text = doc.getText();

    const diagnostics = [];

    const urlRegex = /url:\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      const url = match[1];
      const index = match.index;

      const matchedSwaggerUrl = findMatchingSwaggerUrl(url, mockSwagger);

      if (!matchedSwaggerUrl) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: doc.positionAt(index),
            end: doc.positionAt(index + match[0].length)
          },
          message: `URL "${url}" не найден в спецификации Swagger.`,
          source: 'mockSwagger'
        });
      } else {
        const methodRegex = /type:\s*['"]([^'"]+)['"]/g;
        let methodMatch: RegExpExecArray | null;
        while ((methodMatch = methodRegex.exec(text)) !== null) {
          const method = methodMatch[1].toLowerCase();
          const methodIndex = methodMatch.index;

          if (!mockSwagger[matchedSwaggerUrl][method]) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: doc.positionAt(methodIndex),
                end: doc.positionAt(methodIndex + methodMatch[0].length)
              },
              message: `Метод "${method}" не поддерживается для URL "${matchedSwaggerUrl}".`,
              source: 'mockSwagger'
            });
          }
        }
      }
    }

    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
  });
}

// Функция для сопоставления url с параметрами: /users/{id} или /users/{id}/links
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

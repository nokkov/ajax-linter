import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, InsertTextFormat, DiagnosticSeverity } from 'vscode-languageserver/node';

import { AjaxFeature } from '../../src/features/ajaxFeature';

// Мок для утилит
jest.mock('../src/utils/utils', () => ({
  getMatchingSwaggerUrl: (url: string) => {
    if (url === '/api/users') return '/api/users';
    if (url === '/api/products') return '/api/products';
    return undefined;
  },
  getNodeType: (node: ts.Node) => {
    if (ts.isStringLiteral(node)) return 'string';
    if (ts.isNumericLiteral(node)) return 'number';
    if (ts.isObjectLiteralExpression(node)) return 'object';
    if (ts.isArrayLiteralExpression(node)) return 'array';
    return undefined;
  },
  generateDataSnippet: jest.fn().mockImplementation(() => '{}'),
  getDefaultValue: (type?: string) => {
    if (type === 'string') return '""';
    if (type === 'number' || type === 'integer') return '0';
    if (type === 'boolean') return 'false';
    return '""';
  }
}));

// Мок для Swagger-данных
jest.mock('../src/types/swagger', () => ({
  mockSwagger: {
    '/api/users': {
      get: {
        description: 'Get users',
      },
      post: {
        description: 'Create user',
        parameters: [
          {
            in: 'body',
            schema: {
              required: ['name', 'email'],
              properties: {
                name: { type: 'string', example: 'John Doe' },
                email: { type: 'string', example: 'john@example.com' },
                age: { type: 'integer' }
              }
            }
          }
        ]
      }
    },
    '/api/products': {
      get: {
        description: 'Get products'
      }
    }
  }
}));

describe('AjaxFeature', () => {
  let feature: AjaxFeature;
  let sourceFile: ts.SourceFile;
  let document: TextDocument;

  beforeEach(() => {
    feature = new AjaxFeature();
  });

  // Вспомогательная функция для создания документа и анализа кода
  function setupTest(code: string) {
    document = TextDocument.create('file:///test.ts', 'typescript', 1, code);
    sourceFile = ts.createSourceFile(
      'test.ts',
      code,
      ts.ScriptTarget.Latest,
      true
    );
    return sourceFile;
  }

  // Функция для поиска вызова $.ajax в AST
  function findAjaxCallExpression(sourceFile: ts.SourceFile): ts.CallExpression | undefined {
    let result: ts.CallExpression | undefined;
    
    function visit(node: ts.Node) {
      if (feature.matches(node)) {
        result = node as ts.CallExpression;
        return;
      }
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return result;
  }

  describe('Autocomplete tests', () => {
    test('should provide url completions in empty url property', () => {
      // Setup
      const code = `$.ajax({
        url: ""
      });`;
      
      const sourceFile = setupTest(code);
      const ajaxCall = findAjaxCallExpression(sourceFile);
      expect(ajaxCall).toBeDefined();
      
      // Позиция курсора внутри кавычек url
      const position = {
        line: 1,
        character: 14 // Позиция между кавычками
      };
      
      // Act
      const completions = feature.provideCompletionItems(
        ajaxCall!,
        { textDocument: { uri: 'file:///test.ts' }, position },
        document
      );
      
      // Assert
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some(item => item.label === '/api/users')).toBe(true);
      expect(completions.some(item => item.label === '/api/products')).toBe(true);
    });

    test('should provide method completions based on selected url', () => {
      // Setup
      const code = `$.ajax({
        url: "/api/users",
        type: ""
      });`;
      
      const sourceFile = setupTest(code);
      const ajaxCall = findAjaxCallExpression(sourceFile);
      expect(ajaxCall).toBeDefined();
      
      // Позиция курсора внутри кавычек type
      const position = {
        line: 2,
        character: 15 // Позиция между кавычками
      };
      
      // Act
      const completions = feature.provideCompletionItems(
        ajaxCall!,
        { textDocument: { uri: 'file:///test.ts' }, position },
        document
      );
      
      // Assert
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some(item => item.label === 'GET')).toBe(true);
      expect(completions.some(item => item.label === 'POST')).toBe(true);
    });
  });

  describe('Diagnostic tests', () => {
    test('should report error for invalid URL', () => {
      // Setup
      const code = `$.ajax({
        url: "/api/invalid-url",
        type: "GET"
      });`;
      
      const sourceFile = setupTest(code);
      const ajaxCall = findAjaxCallExpression(sourceFile);
      expect(ajaxCall).toBeDefined();
      
      const diagnostics: any[] = [];
      
      // Act
      feature.provideDiagnostics(ajaxCall!, document, diagnostics);
      
      // Assert
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.some(d => 
        d.severity === DiagnosticSeverity.Error && 
        d.message.includes('Неизвестный URL')
      )).toBe(true);
    });

    test('should report error for missing required fields in data', () => {
      // Setup
      const code = `$.ajax({
        url: "/api/users",
        type: "POST",
        data: {
          age: 30
        }
      });`;
      
      const sourceFile = setupTest(code);
      const ajaxCall = findAjaxCallExpression(sourceFile);
      expect(ajaxCall).toBeDefined();
      
      const diagnostics: any[] = [];
      
      // Act
      feature.provideDiagnostics(ajaxCall!, document, diagnostics);
      
      // Assert
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.some(d => 
        d.severity === DiagnosticSeverity.Error && 
        d.message.includes('Отсутствует обязательное поле')
      )).toBe(true);
      expect(diagnostics.some(d => d.message.includes("'name'"))).toBe(true);
      expect(diagnostics.some(d => d.message.includes("'email'"))).toBe(true);
    });
  });
}); 
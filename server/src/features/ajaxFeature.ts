import * as ts from 'typescript';
import {
    CompletionItem,
    CompletionItemKind,
    Diagnostic,
    DiagnosticSeverity,
    Range,
    TextDocumentPositionParams,
    InsertTextFormat
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ICompletionFeature, IDiagnosticFeature } from './feature';

import { mockSwagger, SwaggerPath } from '../types/swagger';
import {
    getMatchingSwaggerUrl,
    getNodeType,
    generateDataSnippet,
    getDefaultValue
} from '../utils/utils';


/**
 * Модуль функциональности, предоставляющий автодополнение и диагностики для вызовов $.ajax
 * Реализует интерфейсы ICompletionFeature и IDiagnosticFeature.
 */
export class AjaxFeature implements ICompletionFeature, IDiagnosticFeature {

    /**
     * Проверяет, является ли данный узел AST вызовом $.ajax или jQuery.ajax
     * и имеет ли он первым аргументом объектный литерал конфигурации.
     * Эта логика взята из исходного server.ts.
     * @param node Узел AST для проверки.
     * @returns true, если узел соответствует вызову $.ajax/jQuery.ajax с объектом конфигурации.
     */
    matches(node: ts.Node): boolean {
        if (ts.isCallExpression(node)) {
            const call = node as ts.CallExpression;
            if (ts.isPropertyAccessExpression(call.expression)) {
                const propAccess = call.expression as ts.PropertyAccessExpression;
                if (
                    (ts.isIdentifier(propAccess.expression) &&
                        (propAccess.expression.text === '$' || propAccess.expression.text === 'jQuery')) &&
                    ts.isIdentifier(propAccess.name) &&
                    propAccess.name.text === 'ajax'
                ) {
                    // Проверяем, что есть хотя бы один аргумент и это объектный литерал
                    return call.arguments.length > 0 && ts.isObjectLiteralExpression(call.arguments[0]);
                }
            }
        }
        return false;
    }

    /**
     * Предоставляет элементы автодополнения для объекта конфигурации $.ajax.
     * Логика полностью перенесена из исходного completion.ts -> getAjaxCompletionItems.
     * @param node Узел AST, соответствующий вызову $.ajax/jQuery.ajax.
     * @param textDocumentPosition Параметры позиции курсора.
     * @param document Текстовый документ.
     * @returns Массив элементов автодополнения.
     */
    provideCompletionItems(node: ts.Node, textDocumentPosition: TextDocumentPositionParams, document: TextDocument): CompletionItem[] {
        // Поскольку matches(node) уже вернул true, мы знаем, что node - это CallExpression
        const call = node as ts.CallExpression;
        // И что первый аргумент - это ObjectLiteralExpression
        const configObject = call.arguments[0] as ts.ObjectLiteralExpression;

        // Далее идет вся логика из getAjaxCompletionItems, адаптированная к тому,
        // что configObject уже известен.
        const completions: CompletionItem[] = [];
        const offset = document.offsetAt(textDocumentPosition.position);

        let currentUrl: string | undefined;
        let currentType: string | undefined;

        // Сначала собираем информацию о текущих url и type из свойств configObject
        for (const prop of configObject.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                if (prop.name.text === 'url' && ts.isStringLiteral(prop.initializer)) {
                    currentUrl = prop.initializer.text;
                } else if ((prop.name.text === 'type' || prop.name.text === 'method') && ts.isStringLiteral(prop.initializer)) {
                    currentType = prop.initializer.text.toLowerCase();
                }
            }
        }

        // Определяем, находимся ли мы внутри существующего свойства для автодополнения значений
        for (const prop of configObject.properties) {
            if (ts.isPropertyAssignment(prop)) {
                if (ts.isIdentifier(prop.name)) {
                    const propName = prop.name.text;

                    // Проверяем, находимся ли мы внутри строкового литерала
                    if (ts.isStringLiteral(prop.initializer)) {
                        const valueStart = document.offsetAt(document.positionAt(prop.initializer.getStart()));
                        const valueEnd = document.offsetAt(document.positionAt(prop.initializer.getEnd()));

                        // Курсор находится между кавычками (или сразу после открывающей кавычки)
                        if (offset > valueStart && offset <= valueEnd) {
                            if (propName === 'url') {
                                return Object.keys(mockSwagger).map(url => ({
                                    label: url,
                                    kind: CompletionItemKind.Value,
                                    insertText: url,
                                    filterText: url
                                }));
                            } else if (propName === 'type' || propName === 'method') {
                                if (currentUrl) {
                                    const availableMethods: string[] = [];
                                    const swaggerUrlMatch = getMatchingSwaggerUrl(currentUrl);
                                    if (swaggerUrlMatch) {
                                        const methods = mockSwagger[swaggerUrlMatch];
                                        for (const method in methods) {
                                            if (method !== 'description' && !availableMethods.includes(method.toUpperCase())) {
                                                availableMethods.push(method.toUpperCase());
                                            }
                                        }
                                    }
                                    return availableMethods.map(method => ({
                                        label: method,
                                        kind: CompletionItemKind.Value,
                                        insertText: method,
                                        filterText: method
                                    }));
                                }
                            }
                        }
                    }
                    // Проверяем, находимся ли мы на позиции значения свойства data
                    else if (propName === 'data') {
                        const afterColonOffset = document.offsetAt(document.positionAt(prop.name.getEnd())) + 1;
                        const propEndOffset = document.offsetAt(document.positionAt(prop.getEnd()));

                        // Курсор находится после двоеточия свойства 'data' или внутри потенциального объекта
                        if (offset >= afterColonOffset && offset <= propEndOffset + 1) {
                            if (currentUrl && currentType && ['post', 'put', 'patch'].includes(currentType)) {
                                const swaggerUrlMatch = getMatchingSwaggerUrl(currentUrl);

                                if (swaggerUrlMatch) {
                                    const method = mockSwagger[swaggerUrlMatch]?.[currentType as keyof SwaggerPath];
                                    if (method) {
                                        const bodyParam = method.parameters?.find(param => param.in === 'body');
                                        if (bodyParam?.schema?.properties) {
                                            const completionsForData: CompletionItem[] = [];
                                            for (const propName in bodyParam.schema.properties) {
                                                const propSchema = bodyParam.schema.properties[propName];
                                                const isRequired = bodyParam.schema.required?.includes(propName);

                                                let insertTextForProp: string;
                                                let detailForProp: string = propSchema.type || '';

                                                if (propSchema.type === 'object' && propSchema.properties) {
                                                    insertTextForProp = `"${propName}": ${generateDataSnippet(propSchema, 2, true)}`;
                                                    detailForProp = 'object';
                                                } else if (propSchema.type === 'array' && propSchema.items) {
                                                    insertTextForProp = `"${propName}": [\n\t\t\${1:${getDefaultValue(propSchema.items.type)}}\n\t]`;
                                                    detailForProp = 'array';
                                                } else {
                                                    insertTextForProp = `"${propName}": \${1:${propSchema.example !== undefined ? JSON.stringify(propSchema.example) : getDefaultValue(propSchema.type)}}`;
                                                    detailForProp += isRequired ? ' (обязательное)' : ' (необязательное)';
                                                }

                                                const item: CompletionItem = {
                                                    label: propName,
                                                    kind: CompletionItemKind.Property,
                                                    insertText: insertTextForProp,
                                                    insertTextFormat: InsertTextFormat.Snippet,
                                                    detail: detailForProp
                                                };

                                                // Проверяем, был ли триггер точкой - логика осталась
                                                const currentPosition = textDocumentPosition.position;
                                                const rangeBefore = Range.create(
                                                    { line: currentPosition.line, character: currentPosition.character - 1 },
                                                    currentPosition
                                                );
                                                const charBefore = document.getText(rangeBefore);

                                                if (charBefore === '.') {
                                                    const replaceRange = Range.create(
                                                        { line: currentPosition.line, character: currentPosition.character - 1 },
                                                        currentPosition
                                                    );
                                                    item.textEdit = {
                                                        range: replaceRange,
                                                        newText: insertTextForProp
                                                    };
                                                } else {
                                                    item.insertText = insertTextForProp;
                                                }


                                                completionsForData.push(item);
                                            }
                                            return completionsForData;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Если курсор находится внутри объекта конфигурации, но не внутри значения,
        // предлагаем доступные свойства с двоеточием
        const configObjectStart = document.offsetAt(document.positionAt(configObject.getStart()));
        const configObjectEnd = document.offsetAt(document.positionAt(configObject.getEnd()));

        if (offset > configObjectStart && offset < configObjectEnd) {
            const existingProps = configObject.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);
            const potentialProps = ['url', 'type', 'method', 'data', 'success', 'error', 'complete']; // Полный список свойств $.ajax
            return potentialProps
                .filter(prop => !existingProps.includes(prop))
                .map(prop => {
                    let insertText = `${prop}: `;
                    let kind: CompletionItemKind;
                    let detail: string | undefined;

                    if (prop === 'url') {
                        insertText += `"\${1}"`; // Добавляем кавычки и snippet
                        detail = 'URL запроса';
                        kind = CompletionItemKind.Snippet;
                    } else if (prop === 'type' || prop === 'method') {
                        insertText += `"\${1}"`; // Добавляем кавычки и snippet
                        detail = 'HTTP метод';
                        kind = CompletionItemKind.Snippet;
                    } else if (prop === 'data') {
                        insertText += `{\n\t\${1}\n}`; // Добавляем пустой объект и snippet
                        detail = 'Данные запроса (body)';
                        kind = CompletionItemKind.Snippet;
                    } else if (prop === 'success' || prop === 'error' || prop === 'complete') {
                         // Snippet для колбэков с аргументом и телом
                        insertText += `(\${1}) => {\n\t\${0}\n}`;
                        detail = `${prop} колбэк`;
                        kind = CompletionItemKind.Snippet;
                    }
                    else {
                         // Для других свойств по умолчанию - просто имя:
                        insertText = `${prop}: \${1}`; // Добавил простой snippet
                        kind = CompletionItemKind.Property;
                    }

                    return {
                        label: prop,
                        kind: kind,
                        insertText: insertText,
                        insertTextFormat: InsertTextFormat.Snippet,
                        detail: detail
                    };
                });
        }


        return completions;
    }

    /**
     * Предоставляет диагностические сообщения для объекта конфигурации $.ajax.
     * Логика полностью перенесена из исходного diagnostics.ts -> processAjaxConfigForDiagnostics.
     * @param node Узел AST, соответствующий вызову $.ajax/jQuery.ajax.
     * @param textDocument Текстовый документ.
     * @param diagnostics Массив, в который должны быть добавлены диагностики.
     */
    provideDiagnostics(node: ts.Node, textDocument: TextDocument, diagnostics: Diagnostic[]): void {
         // Поскольку matches(node) уже вернул true, мы знаем, что node - это CallExpression
        const call = node as ts.CallExpression;
        // И что первый аргумент - это ObjectLiteralExpression
        const configObject = call.arguments[0] as ts.ObjectLiteralExpression;

        let urlNode: ts.StringLiteral | undefined;
        let typeNode: ts.StringLiteral | undefined;
        let dataNode: ts.ObjectLiteralExpression | undefined;

        const encounteredProps = new Set<string>();

        for (const prop of configObject.properties) {
            if (ts.isPropertyAssignment(prop)) {
                if (ts.isIdentifier(prop.name)) {
                    const propName = prop.name.text;

                    if (encounteredProps.has(propName)) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range: {
                                start: textDocument.positionAt(prop.name.getStart()),
                                end: textDocument.positionAt(prop.name.getEnd())
                            },
                            message: `Дублирующееся свойство: '${propName}'`,
                            source: 'swagger-lsp'
                        });
                    }
                    encounteredProps.add(propName);

                    if (propName === 'url' && ts.isStringLiteral(prop.initializer)) {
                        urlNode = prop.initializer;
                    } else if ((propName === 'type' || propName === 'method') && ts.isStringLiteral(prop.initializer)) {
                        typeNode = prop.initializer;
                    } else if (propName === 'data' && ts.isObjectLiteralExpression(prop.initializer)) {
                        dataNode = prop.initializer;
                    }
                }
            }
        }

        // Логика валидации URL, метода и данных
        if (urlNode) {
            const currentUrl = urlNode.text;
            const swaggerUrlMatch = getMatchingSwaggerUrl(currentUrl);

            if (!swaggerUrlMatch) {
                const range = {
                    start: textDocument.positionAt(urlNode.getStart() + 1),
                    end: textDocument.positionAt(urlNode.getEnd() - 1)
                };
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: range,
                    message: `Неизвестный URL: ${currentUrl}`,
                    source: 'swagger-lsp'
                });
            } else if (typeNode) {
                const type = typeNode.text.toLowerCase();
                if (!mockSwagger[swaggerUrlMatch]?.[type as keyof SwaggerPath]) {
                    const range = {
                        start: textDocument.positionAt(typeNode.getStart() + 1),
                        end: textDocument.positionAt(typeNode.getEnd() - 1)
                    };
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: range,
                        message: `Недопустимый HTTP метод '${type.toUpperCase()}' для URL: ${currentUrl}`,
                        source: 'swagger-lsp'
                    });
                } else if (['post', 'put', 'patch'].includes(type) && dataNode) {
                    const method = mockSwagger[swaggerUrlMatch]?.[type as keyof SwaggerPath];
                    if (method) {
                        const bodyParam = method.parameters?.find(param => param.in === 'body');

                        if (bodyParam?.schema?.properties) {
                            const requiredProps = bodyParam.schema.required || [];
                            const allowedProps = Object.keys(bodyParam.schema.properties);
                            const dataProperties = dataNode.properties.filter(ts.isPropertyAssignment).map(p => (p.name as ts.Identifier).text);

                            // Проверка на отсутствие обязательных полей
                            for (const requiredProp of requiredProps) {
                                if (!dataProperties.includes(requiredProp)) {
                                    const dataRange = {
                                        start: textDocument.positionAt(dataNode.getStart()),
                                        end: textDocument.positionAt(dataNode.getEnd())
                                    };
                                    diagnostics.push({
                                        severity: DiagnosticSeverity.Error,
                                        range: dataRange,
                                        message: `Отсутствует обязательное поле '${requiredProp}' в data`,
                                        source: 'swagger-lsp'
                                    });
                                }
                            }

                            // Проверка на существование полей
                            for (const prop of dataNode.properties) {
                                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                                    const propName = prop.name.text;
                                    if (!allowedProps.includes(propName)) {
                                        const propRange = {
                                            start: textDocument.positionAt(prop.name.getStart()),
                                            end: textDocument.positionAt(prop.name.getEnd())
                                        };
                                        diagnostics.push({
                                            severity: DiagnosticSeverity.Error,
                                            range: propRange,
                                            message: `Неизвестное поле: '${propName}'`,
                                            source: 'swagger-lsp'
                                        });
                                    } else {
                                        // Очень простой проверки типов
                                        const schemaProp = bodyParam.schema.properties[propName];
                                        const propType = getNodeType(prop.initializer);
                                        if (schemaProp.type && propType && schemaProp.type !== propType) {
                                            if (!(schemaProp.type === 'integer' && propType === 'number')) {
                                                diagnostics.push({
                                                    severity: DiagnosticSeverity.Warning,
                                                    range: {
                                                        start: textDocument.positionAt(prop.initializer.getStart()),
                                                        end: textDocument.positionAt(prop.initializer.getEnd())
                                                    },
                                                    message: `Ожидается тип '${schemaProp.type}' для поля '${propName}', получен '${propType}'`,
                                                    source: 'swagger-lsp'
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
import * as ts from 'typescript';
import { CompletionItem, Diagnostic, TextDocumentPositionParams, TextDocument } from 'vscode-languageserver/node';

/**
 * Базовый интерфейс для любого модуля функциональности языкового сервера.
 */
export interface ILanguageServerFeature {
    /**
     * Проверяет, применим ли данный модуль к данному узлу AST.
     * Ядро сервера использует этот метод для определения, какой модуль
     * должен обрабатывать конкретный узел при обходе AST.
     * @param node Узел AST для проверки.
     * @returns true, если модуль применим к узлу, иначе false.
     */
    matches(node: ts.Node): boolean;
}

/**
 * Интерфейс для модулей, способных предоставлять элементы автодополнения.
 */
export interface ICompletionFeature extends ILanguageServerFeature {
    /**
     * Предоставляет элементы автодополнения для узла, если matches(node) вернул true.
     * Ядро сервера вызывает этот метод в ответ на запрос автодополнения от клиента.
     * @param node Узел AST, к которому применим модуль.
     * @param textDocumentPosition Параметры позиции курсора.
     * @param document Текстовый документ.
     * @returns Массив элементов автодополнения.
     */
    provideCompletionItems(node: ts.Node, textDocumentPosition: TextDocumentPositionParams, document: TextDocument): CompletionItem[];
}

/**
 * Интерфейс для модулей, способных предоставлять диагностические сообщения.
 */
export interface IDiagnosticFeature extends ILanguageServerFeature {
     /**
     * Добавляет диагностические сообщения для узла в массив диагностик, если matches(node) вернул true.
     * Ядро сервера вызывает этот метод в процессе валидации документа.
     * @param node Узел AST, к которому применим модуль.
     * @param textDocument Текстовый документ.
     * @param diagnostics Массив, в который должны быть добавлены диагностики.
     */
    provideDiagnostics(node: ts.Node, textDocument: TextDocument, diagnostics: Diagnostic[]): void;
}

/**
 * Объединяющий тип для всех типов модулей функциональности.
 */
export type LanguageServerFeature = ICompletionFeature | IDiagnosticFeature;

/**
 * Менеджер для регистрации и управления модулями функциональности.
 * Ядро сервера использует его для получения списка модулей,
 * заинтересованных в конкретных запросах (автодополнение, диагностики).
 */
export class FeatureManager {
    private features: LanguageServerFeature[] = [];

    /**
     * Регистрирует новый модуль функциональности.
     * @param feature Экземпляр модуля функциональности.
     */
    register(feature: LanguageServerFeature): void {
        this.features.push(feature);
    }

    /**
     * Возвращает все зарегистрированные модули, которые реализуют интерфейс ICompletionFeature.
     */
    getCompletionFeatures(): ICompletionFeature[] {
        return this.features.filter((f): f is ICompletionFeature => 'provideCompletionItems' in f);
    }

    /**
     * Возвращает все зарегистрированные модули, которые реализуют интерфейс IDiagnosticFeature.
     */
    getDiagnosticFeatures(): IDiagnosticFeature[] {
         return this.features.filter((f): f is IDiagnosticFeature => 'provideDiagnostics' in f);
    }
}
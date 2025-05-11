import * as ts from 'typescript';
import { CompletionItem, Diagnostic, TextDocumentPositionParams, TextDocument } from 'vscode-languageserver/node';

export interface ILanguageServerFeature {
    
    matches(node: ts.Node): boolean;

    getSupportedNodeTypes(): ts.SyntaxKind[];
}

export interface ICompletionFeature extends ILanguageServerFeature {
    
    provideCompletionItems(node: ts.Node, textDocumentPosition: TextDocumentPositionParams, document: TextDocument): CompletionItem[];
}

export interface IDiagnosticFeature extends ILanguageServerFeature {
    provideDiagnostics(node: ts.Node, textDocument: TextDocument, diagnostics: Diagnostic[]): void;
}

export type LanguageServerFeature = ICompletionFeature | IDiagnosticFeature;

export class FeatureManager {
    private features: LanguageServerFeature[] = [];
    
    // Кэши для оптимизации
    private completionFeaturesByNodeType: Map<ts.SyntaxKind, ICompletionFeature[]> | null = null;
    private diagnosticFeaturesByNodeType: Map<ts.SyntaxKind, IDiagnosticFeature[]> | null = null;

    register(feature: LanguageServerFeature): void {
        this.features.push(feature);
        this.completionFeaturesByNodeType = null;
        this.diagnosticFeaturesByNodeType = null;
    }

    getCompletionFeatures(): ICompletionFeature[] {
        return this.features.filter((f): f is ICompletionFeature => 'provideCompletionItems' in f);
    }

    getDiagnosticFeatures(): IDiagnosticFeature[] {
        return this.features.filter((f): f is IDiagnosticFeature => 'provideDiagnostics' in f);
    }

    getCompletionFeaturesByNodeType(): Map<ts.SyntaxKind, ICompletionFeature[]> {
        if (!this.completionFeaturesByNodeType) {
            this.completionFeaturesByNodeType = new Map<ts.SyntaxKind, ICompletionFeature[]>();
            const completionFeatures = this.getCompletionFeatures();

            for (const feature of completionFeatures) {
                const nodeTypes = feature.getSupportedNodeTypes();

                for (const nodeType of nodeTypes) {
                    if (!this.completionFeaturesByNodeType.has(nodeType)) {
                        this.completionFeaturesByNodeType.set(nodeType, []);
                    }
                    this.completionFeaturesByNodeType.get(nodeType)!.push(feature);
                }
            }
        }

        return this.completionFeaturesByNodeType;
    }

    getDiagnosticFeaturesByNodeType(): Map<ts.SyntaxKind, IDiagnosticFeature[]> {
        if (!this.diagnosticFeaturesByNodeType) {
            this.diagnosticFeaturesByNodeType = new Map<ts.SyntaxKind, IDiagnosticFeature[]>();
            const diagnosticFeatures = this.getDiagnosticFeatures();

            for (const feature of diagnosticFeatures) {
                const nodeTypes = feature.getSupportedNodeTypes();

                for (const nodeType of nodeTypes) {
                    if (!this.diagnosticFeaturesByNodeType.has(nodeType)) {
                        this.diagnosticFeaturesByNodeType.set(nodeType, []);
                    }
                    this.diagnosticFeaturesByNodeType.get(nodeType)!.push(feature);
                }
            }
        }

        return this.diagnosticFeaturesByNodeType;
    }
}
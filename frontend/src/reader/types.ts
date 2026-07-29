export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSpan {
  id: string;
  text: string;
  confidence: number;
  confidenceScope: string;
  parentLineId?: string;
  bbox: BBox;
}

export interface ProcessorMetadata {
  engine: string;
  engineVersion: string;
  model: string;
  language: string;
  durationMs: number;
  processedAt: string;
}

export interface PageAnalysis {
  schemaVersion: string;
  pageNumber: number;
  dimensions: {
    sourceWidth: number;
    sourceHeight: number;
  };
  language: string;
  textSpans: TextSpan[];
  processor: ProcessorMetadata;
}

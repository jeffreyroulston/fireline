export type SourceKind = "rules" | "cards" | "rulings";

export type ChunkRecord = {
  id: string;
  source: SourceKind;
  title: string;
  uri: string;
  text: string;
  vector: number[];
};

export type Manifest = {
  version: number;
  embeddingModel: string;
  embeddingDims: number;
  tableName: string;
  sources: {
    rules: {
      origin: string;
      lastIngestedAt: string | null;
      pageCount: number;
      chunkCount: number;
    };
    cards: {
      origin: string;
      lastIngestedAt: string | null;
      cardCount: number;
      chunkCount: number;
    };
    rulings: {
      origin: string;
      lastIngestedAt: string | null;
      fileCount: number;
      chunkCount: number;
    };
  };
};

export type SearchHit = {
  id: string;
  source: SourceKind;
  title: string;
  uri: string;
  text: string;
  score: number;
};

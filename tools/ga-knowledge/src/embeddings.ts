import { pipeline } from "@xenova/transformers";
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from "./paths.ts";

type FeatureExtractor = (
  text: string,
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL).then(
      (p) => p as unknown as FeatureExtractor,
    );
  }
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const data = Array.from(output.data);
  if (data.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Unexpected embedding size ${data.length}; expected ${EMBEDDING_DIMS}`,
    );
  }
  return data;
}

export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(await embedText(texts[i]!));
    onProgress?.(i + 1, texts.length);
  }
  return vectors;
}

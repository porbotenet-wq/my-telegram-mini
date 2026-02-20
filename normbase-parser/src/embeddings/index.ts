// Embeddings via OpenAI API (text-embedding-3-small, 1536 dims)
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 20;
const DELAY_MS = 500;

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(`[embed] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`);

    const response = await openai.embeddings.create({
      model: MODEL,
      input: batch,
    });

    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }

    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return allEmbeddings;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const [embedding] = await getEmbeddings([text]);
  return embedding;
}

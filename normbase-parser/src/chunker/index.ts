// Chunker — splits document text into overlapping chunks for embedding
export interface Chunk {
  index: number;
  content: string;
  sectionTitle: string;
  tokenCount: number;
}

const MAX_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;
// Rough estimate: 1 token ≈ 4 chars for Russian text (conservative)
const CHARS_PER_TOKEN = 3;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkDocument(
  sections: { title: string; content: string }[]
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const paragraphs = section.content
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 20);

    let buffer = '';
    let bufferTokens = 0;

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);

      if (bufferTokens + paraTokens > MAX_CHUNK_TOKENS && buffer) {
        chunks.push({
          index: chunkIndex++,
          content: buffer.trim(),
          sectionTitle: section.title,
          tokenCount: bufferTokens,
        });

        // Overlap: keep last part of buffer
        const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;
        buffer = buffer.slice(-overlapChars) + '\n' + para;
        bufferTokens = estimateTokens(buffer);
      } else {
        buffer += (buffer ? '\n' : '') + para;
        bufferTokens += paraTokens;
      }
    }

    // Flush remaining
    if (buffer.trim() && estimateTokens(buffer.trim()) > 30) {
      chunks.push({
        index: chunkIndex++,
        content: buffer.trim(),
        sectionTitle: section.title,
        tokenCount: estimateTokens(buffer.trim()),
      });
    }
  }

  console.log(`[chunker] ${chunks.length} chunks from ${sections.length} sections`);
  return chunks;
}

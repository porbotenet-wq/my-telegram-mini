// Embeddings — local via Python fastembed (multilingual-e5-small, 384 dims)
// Run: python3 src/embed_local.py
// This module is kept for potential future OpenAI integration

import { execSync } from 'child_process';
import path from 'path';

export function runLocalEmbeddings(): void {
  const scriptPath = path.join(import.meta.dirname, 'embed_local.py');
  console.log('[embed] Running local embeddings via fastembed...');
  execSync(`python3 ${scriptPath}`, {
    cwd: path.join(import.meta.dirname, '..'),
    stdio: 'inherit',
  });
}

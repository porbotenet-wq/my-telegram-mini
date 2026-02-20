// Full pipeline: seed → crawl → chunk → embed → store
import { supabase } from './db/supabase.js';
import { SEED_DOCUMENTS } from './seed-documents.js';
import { crawlCntd } from './crawlers/cntd.js';
import { chunkDocument } from './chunker/index.js';
import { runLocalEmbeddings } from './embeddings/index.js';

async function seedDocuments() {
  console.log(`\n=== Seeding ${SEED_DOCUMENTS.length} documents ===\n`);

  for (const doc of SEED_DOCUMENTS) {
    const { error } = await supabase
      .from('norm_documents')
      .upsert(
        {
          source: doc.source,
          code: doc.code,
          title: doc.title,
          url: doc.url,
          category: doc.category,
          doc_type: doc.doc_type,
          status: 'pending',
        },
        { onConflict: 'source,code' }
      );

    if (error) {
      console.error(`[seed] Error ${doc.code}: ${error.message}`);
    } else {
      console.log(`[seed] ${doc.code} — OK`);
    }
  }
}

async function crawlAndParse() {
  console.log(`\n=== Crawling pending documents ===\n`);

  const { data: docs, error } = await supabase
    .from('norm_documents')
    .select('*')
    .eq('status', 'pending')
    .order('created_at');

  if (error || !docs?.length) {
    console.log('[crawl] No pending documents');
    return;
  }

  for (const doc of docs) {
    try {
      console.log(`\n--- ${doc.code} ---`);
      const result = await crawlCntd(doc.url);

      if (result.text.length < 100) {
        console.warn(`[crawl] ${doc.code}: too short (${result.text.length} chars), skipping`);
        await supabase
          .from('norm_documents')
          .update({ status: 'error', metadata: { error: 'Content too short' } })
          .eq('id', doc.id);
        continue;
      }

      // Store raw text
      await supabase
        .from('norm_documents')
        .update({
          raw_text: result.text,
          status: 'parsed',
          metadata: {
            sections: result.sections.length,
            chars: result.text.length,
            crawled_at: new Date().toISOString(),
          },
        })
        .eq('id', doc.id);

      // Chunk
      const chunks = chunkDocument(result.sections);

      // Store chunks (without embeddings yet)
      for (const chunk of chunks) {
        await supabase.from('norm_chunks').insert({
          document_id: doc.id,
          chunk_index: chunk.index,
          content: chunk.content,
          section_title: chunk.sectionTitle,
          token_count: chunk.tokenCount,
        });
      }

      console.log(`[crawl] ${doc.code}: ${chunks.length} chunks stored`);

      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error(`[crawl] ${doc.code} failed: ${err.message}`);
      await supabase
        .from('norm_documents')
        .update({ status: 'error', metadata: { error: err.message } })
        .eq('id', doc.id);
    }
  }
}

async function embedChunks() {
  console.log(`\n=== Embedding via local fastembed (multilingual-e5-small, 384 dims) ===\n`);
  runLocalEmbeddings();
}

async function main() {
  const args = process.argv.slice(2);
  const step = args[0] || 'all';

  try {
    if (step === 'all' || step === 'seed') await seedDocuments();
    if (step === 'all' || step === 'crawl') await crawlAndParse();
    if (step === 'all' || step === 'embed') await embedChunks();

    console.log('\n=== Pipeline complete ===');
  } catch (err) {
    console.error('Pipeline failed:', err);
    process.exit(1);
  }
}

main();

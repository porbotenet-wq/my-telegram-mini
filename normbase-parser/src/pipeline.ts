// Full pipeline: seed → crawl → chunk → embed → store
import { supabase } from './db/supabase.js';
import { SEED_DOCUMENTS } from './seed-documents.js';
import { crawlCntd } from './crawlers/cntd.js';
import { chunkDocument } from './chunker/index.js';
import { getEmbeddings } from './embeddings/index.js';

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
  console.log(`\n=== Embedding parsed documents ===\n`);

  const { data: docs, error } = await supabase
    .from('norm_documents')
    .select('id, code')
    .eq('status', 'parsed');

  if (error || !docs?.length) {
    console.log('[embed] No parsed documents to embed');
    return;
  }

  for (const doc of docs) {
    console.log(`\n--- Embedding ${doc.code} ---`);

    const { data: chunks } = await supabase
      .from('norm_chunks')
      .select('id, content')
      .eq('document_id', doc.id)
      .is('embedding', null)
      .order('chunk_index');

    if (!chunks?.length) {
      console.log(`[embed] ${doc.code}: no chunks to embed`);
      continue;
    }

    const texts = chunks.map(c => c.content);
    const embeddings = await getEmbeddings(texts);

    for (let i = 0; i < chunks.length; i++) {
      await supabase
        .from('norm_chunks')
        .update({ embedding: embeddings[i] as any })
        .eq('id', chunks[i].id);
    }

    await supabase
      .from('norm_documents')
      .update({ status: 'embedded', updated_at: new Date().toISOString() })
      .eq('id', doc.id);

    console.log(`[embed] ${doc.code}: ${chunks.length} chunks embedded`);
  }
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

#!/usr/bin/env python3
"""Generate embeddings for norm_chunks using fastembed (local, free)."""
import json
import os
import sys
from fastembed import TextEmbedding

# Model: multilingual-e5-small — good for Russian, 384 dims
MODEL_NAME = "intfloat/multilingual-e5-small"
BATCH_SIZE = 32

def get_supabase_config():
    """Read config from .env file."""
    config = {}
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    config[k.strip()] = v.strip()
    return config

def main():
    import urllib.request
    import urllib.parse

    config = get_supabase_config()
    base_url = config.get('SUPABASE_URL', '')
    service_key = config.get('SUPABASE_SERVICE_ROLE_KEY', '')

    if not base_url or not service_key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
        sys.exit(1)

    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }

    # Fetch chunks without embeddings from parsed documents
    url = f"{base_url}/rest/v1/norm_chunks?embedding=is.null&select=id,content,document_id&order=chunk_index"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        chunks = json.loads(resp.read())

    if not chunks:
        print("No chunks to embed.")
        return

    print(f"Found {len(chunks)} chunks to embed")
    print(f"Loading model {MODEL_NAME}...")
    model = TextEmbedding(MODEL_NAME)

    texts = [f"passage: {c['content']}" for c in chunks]

    print(f"Generating embeddings in batches of {BATCH_SIZE}...")
    embeddings = list(model.embed(texts, batch_size=BATCH_SIZE))

    print(f"Uploading {len(embeddings)} embeddings to Supabase...")
    success = 0
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        emb_list = emb.tolist()
        patch_url = f"{base_url}/rest/v1/norm_chunks?id=eq.{chunk['id']}"
        body = json.dumps({'embedding': emb_list}).encode()
        req = urllib.request.Request(patch_url, data=body, headers=headers, method='PATCH')
        try:
            urllib.request.urlopen(req)
            success += 1
        except Exception as e:
            print(f"  Error chunk {chunk['id']}: {e}")

        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{len(chunks)}")

    print(f"\nDone: {success}/{len(chunks)} embeddings uploaded")

    # Update document statuses to 'embedded'
    doc_ids = list(set(c['document_id'] for c in chunks))
    for doc_id in doc_ids:
        patch_url = f"{base_url}/rest/v1/norm_documents?id=eq.{doc_id}"
        body = json.dumps({'status': 'embedded'}).encode()
        req = urllib.request.Request(patch_url, data=body, headers=headers, method='PATCH')
        try:
            urllib.request.urlopen(req)
        except Exception as e:
            print(f"  Error updating doc {doc_id}: {e}")

    print(f"Updated {len(doc_ids)} documents to 'embedded' status")

if __name__ == '__main__':
    main()

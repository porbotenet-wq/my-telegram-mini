# normbase-parser

Парсер нормативной базы для STSphera AI-инженера.

## Pipeline

```
seed → crawl (cntd.ru) → chunk → embed (OpenAI) → pgvector (Supabase)
```

## Настройка

```bash
cp .env.example .env
# Заполнить SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
npm install
```

## Запуск

```bash
# Полный пайплайн
npm run pipeline

# По шагам
npm run pipeline -- seed    # Загрузить документы в БД
npm run pipeline -- crawl   # Скачать и распарсить
npm run pipeline -- embed   # Создать embeddings
```

## Структура

```
src/
  crawlers/cntd.ts    — парсер docs.cntd.ru
  chunker/index.ts    — разбивка на чанки (500 токенов, overlap 50)
  embeddings/index.ts — OpenAI text-embedding-3-small (1536 dims)
  db/supabase.ts      — клиент Supabase
  seed-documents.ts   — 20 приоритетных документов (НВФ/СПК/алюминий)
  pipeline.ts         — оркестратор
```

## Документы (приоритет)

- НВФ: СП 28.13330, СТО НОСТРОЙ 2.14.67, ГОСТ Р 56926, ТР 161-05
- СПК: ГОСТ 30674, ГОСТ 21519, ГОСТ 24866
- Алюминий: ГОСТ 22233, ГОСТ 4784, ГОСТ 9.301
- Общее: СП 48.13330, СНиП 12-03/04, МДС 12-29

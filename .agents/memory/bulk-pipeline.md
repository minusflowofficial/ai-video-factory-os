---
name: Bulk pipeline patterns
description: Key decisions in the bulk video pipeline — retry logic, output storage, manual quotes
---

## Retry wrapper
`withRetry(fn, maxRetries=2, baseDelayMs=8000)` wraps both `processOne` (standard) and `createOneQuoteVideo` (quotes). Backoff: `baseDelayMs * (attempt + 1)`. Failures after all retries increment `failedCount`.

## Output storage
Quotes pipeline stores each completed MP4 path in `bulk_job_outputs` table (jobId, filePath, quoteText, videoIndex). Standard pipeline creates Studio projects — already visible in projects table.

**Why:** `/tmp/quote-outputs/` files are ephemeral; DB records survive server restarts and surface in the Projects → Bulk Batches tab with download links.

## Manual quotes
`quotes?: string[]` added to `CreateBulkJobBody` (Zod + OpenAPI). If supplied and non-empty, `runBulkQuotesPipeline` skips `generateQuotes()` and uses them directly. `totalVideos` is overridden by `quotes.length`.

## Frontend parsing
`parseQuotes(text)` — splits on newlines, trims, filters lines shorter than 5 chars.

## Download endpoint
`GET /api/bulk-outputs/:id/download` — serves the file from `filePath` stored in DB; returns 410 if file is missing from disk.

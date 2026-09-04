# 09 Storage

File uploads with metadata in Postgres and bytes behind an adapter.

## Data model

`files`
- `id uuid pk`, `storage_key text unique not null`
- `filename text not null`, `content_type text not null`, `size_bytes bigint not null`
- `sha256 text not null`
- `uploaded_by uuid fk users`, `entity_type text null`, `entity_id uuid null`
- `created_at`, `deleted_at null`
- Index `(entity_type, entity_id)`

## Adapter (`platform/storage/`)

```ts
interface StorageDriver {
  put(key, body: Readable | Buffer, contentType): Promise<void>;
  get(key): Promise<Readable>;
  delete(key): Promise<void>;
}
```

- `disk` driver: writes under `FILES_DIR` (default `./data/files`), key becomes a
  path with two levels of prefix directories. For single-VPS deployments with a
  mounted volume.
- `s3` driver: `@aws-sdk/client-s3` with `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`
  (optional, for R2 and MinIO), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `S3_FORCE_PATH_STYLE`.
- Selected by `STORAGE_DRIVER`. Keys are `<yyyy>/<mm>/<uuid>` with no user input.

## API

- `POST /api/files` multipart, fields `file`, optional `entityType`, `entityId`.
  Limits: `UPLOAD_MAX_BYTES` (default 25 MB). Content type is sniffed from the first
  bytes with a small allowlist table (images, PDF, CSV, XLSX, DOCX, plain text,
  ZIP); anything else is stored as `application/octet-stream` and served as a
  download. Requires the `write` permission of the owning entity when given, else
  `files:manage`.
- `GET /api/files/:id` streams the bytes with `Content-Disposition: attachment`
  (or `inline` for images and PDF), after checking the `read` permission of the
  owning entity.
- `DELETE /api/files/:id` soft deletes; a scheduled job hard-deletes bytes after
  `FILES_TRASH_DAYS`.
- Uploads go through the API rather than presigned URLs so auth and audit are the
  same as everything else. Presigned upload can be added later for very large files.

## Client

- `FileField` for forms (single file) and `AttachmentList` for detail pages with
  upload, download and remove.

## Done when

- Notes golden example attaches and downloads a file with both drivers (disk in
  tests, S3 verified once against MinIO in compose).
- Tests: size limit enforced, content type sniffing, permission check on download,
  soft delete hides and trash job removes bytes.

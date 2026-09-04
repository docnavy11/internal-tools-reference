import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageDriver } from './driver';

export interface S3Options {
  bucket: string;
  region: string;
  endpoint?: string; // R2, MinIO and other S3-compatible stores
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export function s3Driver(opts: S3Options): StorageDriver {
  const client = new S3Client({
    region: opts.region,
    endpoint: opts.endpoint,
    forcePathStyle: opts.forcePathStyle ?? false,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
  });
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: key }));
      if (!out.Body) throw new Error(`empty body for ${key}`);
      return out.Body as Readable;
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
    },
  };
}

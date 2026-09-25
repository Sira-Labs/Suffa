/** ObjectStorage on any S3-compatible store (RustFS in production), ADR-0017. */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  isSafeKey,
  PRESIGN_SECONDS,
  toMediaPath,
  type BucketRole,
  type ObjectStorage,
  type StoredObject,
  type UploadPart,
} from './objectStorage.js';

export interface S3Settings {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  buckets: Record<BucketRole, string>;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly settings: S3Settings) {
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    });
  }

  private target(bucket: BucketRole, key: string) {
    if (!isSafeKey(key)) throw new Error(`unsafe object key: ${key}`);
    return { Bucket: this.settings.buckets[bucket], Key: key };
  }

  private media(url: string) {
    return toMediaPath(url, this.settings.endpoint);
  }

  async put(bucket: BucketRole, key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        ...this.target(bucket, key),
        Body: body,
        ContentType: contentType,
      })
    );
  }

  async get(bucket: BucketRole, key: string) {
    try {
      const out = await this.client.send(new GetObjectCommand(this.target(bucket, key)));
      return out.Body ? await out.Body.transformToByteArray() : new Uint8Array();
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async head(bucket: BucketRole, key: string): Promise<StoredObject | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand(this.target(bucket, key)));
      return { size: out.ContentLength ?? 0, contentType: out.ContentType ?? null };
    } catch (error) {
      if (error instanceof NotFound || error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async delete(bucket: BucketRole, key: string) {
    await this.client.send(new DeleteObjectCommand(this.target(bucket, key)));
  }

  async presignGet(bucket: BucketRole, key: string, seconds = PRESIGN_SECONDS) {
    return this.media(
      await getSignedUrl(this.client, new GetObjectCommand(this.target(bucket, key)), {
        expiresIn: seconds,
      })
    );
  }

  async presignPut(
    bucket: BucketRole,
    key: string,
    contentType: string,
    seconds = PRESIGN_SECONDS
  ) {
    return this.media(
      await getSignedUrl(
        this.client,
        new PutObjectCommand({ ...this.target(bucket, key), ContentType: contentType }),
        { expiresIn: seconds }
      )
    );
  }

  async createMultipartUpload(bucket: BucketRole, key: string, contentType: string) {
    const out = await this.client.send(
      new CreateMultipartUploadCommand({
        ...this.target(bucket, key),
        ContentType: contentType,
      })
    );
    if (!out.UploadId) throw new Error('store returned no upload id');
    return out.UploadId;
  }

  async presignUploadPart(
    bucket: BucketRole,
    key: string,
    uploadId: string,
    partNumber: number,
    seconds = PRESIGN_SECONDS
  ) {
    return this.media(
      await getSignedUrl(
        this.client,
        new UploadPartCommand({
          ...this.target(bucket, key),
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: seconds }
      )
    );
  }

  async listParts(
    bucket: BucketRole,
    key: string,
    uploadId: string
  ): Promise<UploadPart[]> {
    const parts: UploadPart[] = [];
    let marker: string | undefined;
    do {
      const out = await this.client.send(
        new ListPartsCommand({
          ...this.target(bucket, key),
          UploadId: uploadId,
          PartNumberMarker: marker,
        })
      );
      for (const p of out.Parts ?? []) {
        if (p.PartNumber && p.ETag)
          parts.push({ partNumber: p.PartNumber, etag: p.ETag });
      }
      marker = out.IsTruncated ? out.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }

  async completeMultipartUpload(
    bucket: BucketRole,
    key: string,
    uploadId: string,
    parts: UploadPart[]
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        ...this.target(bucket, key),
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      })
    );
  }

  async abortMultipartUpload(bucket: BucketRole, key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({ ...this.target(bucket, key), UploadId: uploadId })
    );
  }
}

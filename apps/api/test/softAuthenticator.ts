/**
 * A software passkey for tests: one P-256 key, "none" attestation, answers the WebAuthn
 * registration and sign-in ceremonies the way a browser would hand them to the server.
 * Only what our tests need; no extensions, no attestation certificates.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const b64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();

type Cbor = number | string | Uint8Array | Cbor[] | Map<Cbor, Cbor>;

function head(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  const out = Buffer.alloc(3);
  out[0] = (major << 5) | 25;
  out.writeUInt16BE(length, 1);
  return out;
}

/** Just enough CBOR (RFC 8949) for attestation objects and COSE keys. */
function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') {
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  if (Array.isArray(value))
    return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  return Buffer.concat([
    head(5, value.size),
    ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ]);
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

export interface SoftAuthenticatorOptions {
  origin: string;
  /** Whether the authenticator reports that it checked the PIN or biometric. */
  userVerified?: boolean;
  /** A synced passkey (iCloud Keychain, Google Password Manager). */
  synced?: boolean;
  aaguid?: string;
}

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private counter = 0;
  private userHandle: string | undefined;

  constructor(private readonly options: SoftAuthenticatorOptions) {}

  get id(): string {
    return b64url(this.credentialId);
  }

  private flags(extra: number): number {
    let flags = FLAG_UP | extra;
    if (this.options.userVerified ?? true) flags |= FLAG_UV;
    if (this.options.synced) flags |= FLAG_BE | FLAG_BS;
    return flags;
  }

  private clientData(type: string, challenge: string): Buffer {
    return Buffer.from(
      JSON.stringify({ type, challenge, origin: this.options.origin, crossOrigin: false })
    );
  }

  /** Answers `navigator.credentials.create()` for the given registration options. */
  register(options: { challenge: string; rp: { id: string }; user: { id: string } }) {
    this.userHandle = options.user.id;
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    const coseKey = cbor(
      new Map<Cbor, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ])
    );
    const aaguid = Buffer.from(
      (this.options.aaguid ?? '00000000-0000-0000-0000-000000000000').replace(/-/g, ''),
      'hex'
    );
    const length = Buffer.alloc(2);
    length.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(options.rp.id),
      Buffer.from([this.flags(FLAG_AT)]),
      Buffer.alloc(4),
      aaguid,
      length,
      this.credentialId,
      coseKey,
    ]);
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ])
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge)),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
    };
  }

  /** Answers `navigator.credentials.get()` for the given sign-in options. */
  authenticate(options: { challenge: string; rpId?: string }, rpId: string) {
    this.counter += 1;
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const authData = Buffer.concat([
      sha256(options.rpId ?? rpId),
      Buffer.from([this.flags(0)]),
      count,
    ]);
    const clientData = this.clientData('webauthn.get', options.challenge);
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientData)]),
      this.keys.privateKey
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: this.userHandle,
      },
    };
  }
}

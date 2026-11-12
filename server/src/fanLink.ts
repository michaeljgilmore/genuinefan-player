/**
 * Device keys and signatures for Fan Signals sync. WebCrypto only (globalThis.crypto.subtle), so the server, the
 * desktop app and the phone build share this module.
 *
 * Each player install has its own ECDSA P-256 key pair. The public key goes to GenuineFan once, when the listener
 * links the player from their signed-in GenuineFan account; after that every payload is signed with the private key,
 * which never leaves the device. GenuineFan verifies the signature with the stored public key, so a payload can't be
 * forged or edited in transit, and a device can be revoked from GenuineFan at any time.
 */
import { canonicalJson, type FanSignalsPayload } from "./fanSignals.js";

export const SIGNATURE_ALG = "ES256" as const;
const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

export interface DeviceKeys {
  /** Random, not derived from hardware. Rotated on unlink. */
  deviceId: string;
  /** SubjectPublicKeyInfo, base64url. Shared with GenuineFan in the link URL. */
  publicKeySpki: string;
  /** Private key as JWK. Stays in the local listening file. */
  privateKeyJwk: JsonWebKey;
  createdAt: number;
}

export interface SignedEnvelope {
  alg: typeof SIGNATURE_ALG;
  deviceId: string;
  /** The exact JSON string that was signed (canonical: keys sorted). */
  payload: string;
  /** IEEE P1363 (r||s) signature over the UTF-8 bytes of `payload`, base64url. */
  signature: string;
}

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is not available on this platform");
  return s;
};

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateDeviceKeys(now = Date.now()): Promise<DeviceKeys> {
  const pair = (await subtle().generateKey(ALGORITHM, true, ["sign", "verify"])) as CryptoKeyPair;
  const spki = await subtle().exportKey("spki", pair.publicKey);
  const jwk = await subtle().exportKey("jwk", pair.privateKey);
  return { deviceId: `gfp_${globalThis.crypto.randomUUID().replace(/-/g, "")}`, publicKeySpki: base64url(spki), privateKeyJwk: jwk, createdAt: now };
}

export async function signPayload(keys: DeviceKeys, payload: FanSignalsPayload): Promise<SignedEnvelope> {
  const key = await subtle().importKey("jwk", keys.privateKeyJwk, ALGORITHM, false, ["sign"]);
  const text = canonicalJson(payload);
  const sig = await subtle().sign(SIGN, key, new TextEncoder().encode(text));
  return { alg: SIGNATURE_ALG, deviceId: keys.deviceId, payload: text, signature: base64url(sig) };
}

/** What GenuineFan does on its side (also used by the tests). */
export async function verifyEnvelope(envelope: SignedEnvelope, publicKeySpki: string): Promise<boolean> {
  if (envelope.alg !== SIGNATURE_ALG) return false;
  const key = await subtle().importKey("spki", fromBase64url(publicKeySpki) as BufferSource, ALGORITHM, false, ["verify"]);
  return subtle().verify(SIGN, key, fromBase64url(envelope.signature) as BufferSource, new TextEncoder().encode(envelope.payload));
}

/** The page on GenuineFan where a signed-in fan approves this device. */
export function linkUrl(appUrl: string, keys: DeviceKeys, label: string): string {
  const u = new URL("/player/link", appUrl);
  u.searchParams.set("device", keys.deviceId);
  u.searchParams.set("key", keys.publicKeySpki);
  u.searchParams.set("alg", SIGNATURE_ALG);
  u.searchParams.set("label", label.slice(0, 60));
  return u.toString();
}

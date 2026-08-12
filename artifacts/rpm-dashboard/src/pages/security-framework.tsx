import { useState } from "react";
import Layout from "@/components/layout";
import {
  ShieldCheck,
  Link2,
  BrainCircuit,
  LockKeyhole,
  KeyRound,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Lightweight syntax tokenizer ────────────────────────────────────────────
type TokenKind =
  | "keyword"
  | "type"
  | "string"
  | "comment"
  | "number"
  | "operator"
  | "function"
  | "plain";

interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "import","from","export","const","let","var","function","return","if","else",
  "while","for","do","new","class","interface","type","extends","implements",
  "async","await","true","false","null","undefined","of","in","switch","case",
  "break","default","throw","try","catch","finally","void","typeof","instanceof",
  "this","super","static","readonly","as","enum","namespace","declare","abstract",
  "public","private","protected","override",
]);
const TYPES = new Set([
  "string","number","boolean","bigint","symbol","never","any","unknown","object",
  "Buffer","Promise","Array","Record","Partial","Required","Readonly","Map","Set",
  "Error","Date","RegExp","BigInt",
]);

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    // Line comment
    if (code[i] === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const text = end === -1 ? code.slice(i) : code.slice(i, end);
      tokens.push({ kind: "comment", text });
      i += text.length;
      continue;
    }
    // Block comment
    if (code[i] === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const text = end === -1 ? code.slice(i) : code.slice(i, end + 2);
      tokens.push({ kind: "comment", text });
      i += text.length;
      continue;
    }
    // String (single/double/template)
    if (code[i] === '"' || code[i] === "'" || code[i] === "`") {
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q) {
        if (code[j] === "\\" ) j++;
        j++;
      }
      tokens.push({ kind: "string", text: code.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // Number
    if (/[0-9]/.test(code[i]) || (code[i] === "0" && code[i+1] === "x")) {
      let j = i;
      while (j < code.length && /[0-9a-fA-Fx._n]/.test(code[j])) j++;
      tokens.push({ kind: "number", text: code.slice(i, j) });
      i = j;
      continue;
    }
    // Word (keyword / type / function call / identifier)
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[\w$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let kind: TokenKind = "plain";
      if (KEYWORDS.has(word)) kind = "keyword";
      else if (TYPES.has(word)) kind = "type";
      else if (code[j] === "(") kind = "function";
      tokens.push({ kind, text: word });
      i = j;
      continue;
    }
    // Operators / punctuation
    if (/[+\-*/%=<>!&|^~?:.,;(){}[\]]/.test(code[i])) {
      tokens.push({ kind: "operator", text: code[i] });
      i++;
      continue;
    }
    // Whitespace / other
    tokens.push({ kind: "plain", text: code[i] });
    i++;
  }
  return tokens;
}

const TOKEN_COLOR: Record<TokenKind, string> = {
  keyword:  "text-violet-400",
  type:     "text-cyan-400",
  string:   "text-emerald-400",
  comment:  "text-slate-500 italic",
  number:   "text-amber-400",
  operator: "text-slate-400",
  function: "text-sky-300",
  plain:    "text-slate-200",
};

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tokens = tokenize(code.trim());
  const lines = code.trim().split("\n");

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700/60 bg-slate-950 shadow-xl">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700/50">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500/70" />
          <span className="h-3 w-3 rounded-full bg-amber-500/70" />
          <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
        </div>
        <span className="text-[11px] text-slate-500 font-mono">typescript</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5" />Copy</>
          )}
        </button>
      </div>
      {/* Code body */}
      <div className="overflow-x-auto">
        <pre className="p-5 text-[13px] leading-6 font-mono min-w-0">
          <code>
            {/* Re-tokenize per line to attach line numbers */}
            {lines.map((line, lineIdx) => (
              <div key={lineIdx} className="flex">
                <span className="select-none w-9 shrink-0 text-right pr-4 text-slate-600 text-[11px] leading-6">
                  {lineIdx + 1}
                </span>
                <span>
                  {tokenize(line).map((tok, ti) => (
                    <span key={ti} className={TOKEN_COLOR[tok.kind]}>
                      {tok.text}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

// ─── Code samples ─────────────────────────────────────────────────────────────

const AES_CODE = `
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM  = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits

/** Derive a deterministic 256-bit key from a master secret + patient ID. */
export function deriveKey(masterSecret: string, patientId: number): Buffer {
  return createHash("sha256")
    .update(\`\${masterSecret}:\${patientId}\`)
    .digest();
}

/** Encrypt a plain-text vital payload for storage or transit. */
export function encryptPayload(plaintext: string, key: Buffer): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const iv     = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext : encrypted.toString("base64"),
    iv         : iv.toString("base64"),
    authTag    : cipher.getAuthTag().toString("base64"),
  };
}

/** Decrypt and authenticate a previously encrypted payload. */
export function decryptPayload(
  ciphertext : string,
  iv         : string,
  authTag    : string,
  key        : Buffer,
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ── Example: encrypt a vitals snapshot before database write ─────────────────
const masterSecret = process.env.ENCRYPTION_MASTER_KEY!;
const patientId    = 42;
const key          = deriveKey(masterSecret, patientId);

const vitals  = JSON.stringify({ heartRate: 72, spo2: 98.4, systolicBp: 118 });
const sealed  = encryptPayload(vitals, key);
console.log("Stored ciphertext:", sealed.ciphertext.slice(0, 32) + "…");

const restored = decryptPayload(sealed.ciphertext, sealed.iv, sealed.authTag, key);
console.log("Decrypted vitals :", JSON.parse(restored));
`;

const BLOCKCHAIN_CODE = `
import { createHash } from "crypto";

interface AuthEvent {
  userId    : string;
  role      : "provider" | "patient";
  action    : "login" | "logout" | "token_refresh" | "mfa_challenge";
  ipAddress : string;
  sessionId : string;
}

interface Block {
  index        : number;
  timestamp    : number;
  data         : AuthEvent;
  previousHash : string;
  hash         : string;
  nonce        : number;
}

function computeHash(block: Omit<Block, "hash">): string {
  return createHash("sha256")
    .update(JSON.stringify(block))
    .digest("hex");
}

/** Proof-of-work: find a nonce that produces a hash with the required prefix. */
function mineBlock(
  data         : AuthEvent,
  previousHash : string,
  index        : number,
  difficulty   : number = 3,
): Block {
  let nonce  = 0;
  const prefix = "0".repeat(difficulty);

  while (true) {
    const candidate = { index, timestamp: Date.now(), data, previousHash, nonce };
    const hash      = computeHash(candidate);
    if (hash.startsWith(prefix)) {
      return { ...candidate, hash };
    }
    nonce++;
  }
}

/** Append-only blockchain recording every authentication event. */
export class AuthBlockchain {
  private chain: Block[];

  constructor() {
    // Genesis block
    const genesis: Block = {
      index        : 0,
      timestamp    : Date.UTC(2025, 0, 1),
      data         : { userId: "SYSTEM", role: "provider", action: "login",
                       ipAddress: "0.0.0.0", sessionId: "genesis" },
      previousHash : "0000000000000000",
      nonce        : 0,
      hash         : "",
    };
    genesis.hash = computeHash(genesis);
    this.chain = [genesis];
  }

  /** Record an auth event — returns the newly mined block. */
  recordEvent(event: AuthEvent): Block {
    const prev  = this.chain[this.chain.length - 1];
    const block = mineBlock(event, prev.hash, prev.index + 1);
    this.chain.push(block);
    return block;
  }

  /** Verify the entire chain has not been tampered with. */
  verify(): boolean {
    for (let i = 1; i < this.chain.length; i++) {
      const curr = this.chain[i];
      const prev = this.chain[i - 1];
      if (curr.previousHash !== prev.hash) return false;
      const { hash, ...rest } = curr;
      if (computeHash(rest) !== hash)      return false;
    }
    return true;
  }

  get length() { return this.chain.length; }
}

// ── Usage: record a provider login and verify chain integrity ─────────────────
const ledger = new AuthBlockchain();

const block = ledger.recordEvent({
  userId    : "provider-7",
  role      : "provider",
  action    : "login",
  ipAddress : "203.0.113.47",
  sessionId : "sess_a1b2c3d4e5f6",
});

console.log("Block mined   :", block.hash.slice(0, 16) + "…");
console.log("Chain valid   :", ledger.verify());   // → true
console.log("Chain length  :", ledger.length);     // → 2 blocks
`;

const MLNN_CODE = `
/** Multi-Layer Neural Network — Vital-Sign Anomaly Detection
 *
 *  Architecture : 6 inputs → hidden(8, ReLU) → hidden(4, ReLU) → output(sigmoid)
 *  Training set : 120 k de-identified RPM records (balanced 50/50 normal/anomaly)
 *  Threshold    : anomaly score > 0.72  →  alert triggered
 */

type VitalSnapshot = {
  heartRate       : number;   // bpm
  systolicBp      : number;   // mmHg
  diastolicBp     : number;   // mmHg
  spo2            : number;   // %
  respiratoryRate : number;   // breaths / min
  temperature     : number;   // °C
};

// Pre-trained weights (hidden layer 1: 8×6, hidden layer 2: 4×8, output: 1×4)
const W1 = [
  [ 0.231,-0.412, 0.178, 0.893,-0.321, 0.541],
  [ 0.678, 0.124,-0.887, 0.342, 0.712,-0.154],
  [ 0.456,-0.298, 0.632,-0.521, 0.183, 0.770],
  [-0.612, 0.843, 0.227,-0.389, 0.564,-0.431],
  [ 0.309,-0.567, 0.441, 0.218,-0.703, 0.625],
  [-0.144, 0.789,-0.356, 0.612, 0.397,-0.282],
  [ 0.533,-0.201, 0.718,-0.645, 0.129, 0.490],
  [-0.387, 0.556, 0.273,-0.814, 0.468,-0.337],
];
const W2 = [
  [ 0.724,-0.483, 0.612,-0.837, 0.291,-0.558, 0.403,-0.171],
  [-0.316, 0.647,-0.229, 0.518,-0.702, 0.384,-0.545, 0.261],
  [ 0.589,-0.374, 0.841,-0.162, 0.437,-0.693, 0.218,-0.506],
  [-0.452, 0.293,-0.617, 0.784,-0.128, 0.561,-0.339, 0.672],
];
const W3 = [[ 0.821,-0.643, 0.517,-0.389]];

const relu    = (x: number)   => Math.max(0, x);
const sigmoid = (x: number)   => 1 / (1 + Math.exp(-x));
const dot     = (w: number[], v: number[]) => w.reduce((s, wi, i) => s + wi * v[i], 0);

/** Z-score normalisation using population statistics. */
function normalise(v: VitalSnapshot): number[] {
  return [
    (v.heartRate       -  75) / 18,
    (v.systolicBp      - 120) / 20,
    (v.diastolicBp     -  80) / 12,
    (v.spo2            -  97) /  2,
    (v.respiratoryRate -  16) /  4,
    (v.temperature     -  37) /  0.8,
  ];
}

/** Forward pass through the MLNN. Returns an anomaly probability [0, 1]. */
function forwardPass(input: number[]): number {
  const h1  = W1.map(w => relu(dot(w, input)));     // 8-neuron hidden layer
  const h2  = W2.map(w => relu(dot(w, h1)));         // 4-neuron hidden layer
  return sigmoid(dot(W3[0], h2));                    // scalar output
}

export function detectAnomaly(vitals: VitalSnapshot): {
  anomalyScore : number;
  isAnomalous  : boolean;
  confidence   : "high" | "medium" | "low";
  flaggedAxes  : (keyof VitalSnapshot)[];
} {
  const normalised   = normalise(vitals);
  const anomalyScore = forwardPass(normalised);

  const AXES: (keyof VitalSnapshot)[] = [
    "heartRate","systolicBp","diastolicBp","spo2","respiratoryRate","temperature",
  ];
  const flaggedAxes = AXES.filter((_, i) => Math.abs(normalised[i]) > 2.0);

  return {
    anomalyScore : +anomalyScore.toFixed(4),
    isAnomalous  : anomalyScore > 0.72,
    confidence   : anomalyScore > 0.90 ? "high" : anomalyScore > 0.72 ? "medium" : "low",
    flaggedAxes,
  };
}

// ── Example: evaluate a critical reading ─────────────────────────────────────
const reading: VitalSnapshot = {
  heartRate: 148, systolicBp: 185, diastolicBp: 112,
  spo2: 91, respiratoryRate: 26, temperature: 38.9,
};

const result = detectAnomaly(reading);
console.log("Anomaly score :", result.anomalyScore);   // e.g. 0.9612
console.log("Is anomalous  :", result.isAnomalous);    // → true
console.log("Confidence    :", result.confidence);     // → "high"
console.log("Flagged axes  :", result.flaggedAxes);    // → ["heartRate", "systolicBp", …]
`;

const HE_CODE = `
/** Paillier Partial Homomorphic Encryption
 *
 *  Property: Enc(a) · Enc(b) mod n² = Enc(a + b)
 *
 *  Use-case: aggregate patient vitals across a cohort for population-level
 *  analytics without ever decrypting individual readings — the server
 *  performs arithmetic entirely on ciphertext.
 */

// ── Modular arithmetic helpers ────────────────────────────────────────────────
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function modInverse(a: bigint, m: bigint): bigint {
  // Extended Euclidean
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

function lFunc(u: bigint, n: bigint): bigint {
  return (u - 1n) / n;
}

// ── Key types ─────────────────────────────────────────────────────────────────
interface PublicKey  { n: bigint; g: bigint; nSq: bigint }
interface PrivateKey { lambda: bigint; mu: bigint; n: bigint; nSq: bigint }

/** Generate a Paillier key pair from two large primes p and q. */
export function generateKeyPair(p: bigint, q: bigint): {
  publicKey  : PublicKey;
  privateKey : PrivateKey;
} {
  const n      = p * q;
  const nSq    = n * n;
  const lambda = (p - 1n) * (q - 1n);       // lcm(p-1, q-1) — simplified for equal-length primes
  const g      = n + 1n;                     // generator shortcut valid when p, q same bit-length
  const mu     = modInverse(lambda, n);

  return {
    publicKey  : { n, g, nSq },
    privateKey : { lambda, mu, n, nSq },
  };
}

/** Encrypt a plaintext message m ∈ [0, n). */
export function encrypt(m: bigint, pub: PublicKey, r: bigint): bigint {
  const gm = modPow(pub.g, m, pub.nSq);
  const rn = modPow(r,     pub.n, pub.nSq);
  return (gm * rn) % pub.nSq;
}

/** Homomorphic addition of two ciphertexts — no decryption required. */
export function addCiphertexts(c1: bigint, c2: bigint, pub: PublicKey): bigint {
  return (c1 * c2) % pub.nSq;
}

/** Decrypt a ciphertext. */
export function decrypt(c: bigint, priv: PrivateKey): bigint {
  const u = modPow(c, priv.lambda, priv.nSq);
  return (lFunc(u, priv.n) * priv.mu) % priv.n;
}

// ── Example: sum heart-rate readings without decrypting individuals ───────────
const p = 61n, q = 53n; // toy primes — production uses 1024-bit+ primes
const { publicKey, privateKey } = generateKeyPair(p, q);

const heartRates = [72n, 68n, 85n, 74n, 79n];
const r          = 32n;  // random blinding factor (must be coprime with n)

const encrypted = heartRates.map(hr => encrypt(hr, publicKey, r));
const sumCipher = encrypted.reduce((acc, c) => addCiphertexts(acc, c, publicKey));

const totalHR   = decrypt(sumCipher, privateKey);
const avgHR     = totalHR / BigInt(heartRates.length);

console.log("Encrypted ciphertexts computed on server — individuals never revealed");
console.log("Decrypted total HR  :", totalHR);   // → 378
console.log("Cohort average HR   :", avgHR);     // → 75
`;

// ─── Tab definitions ──────────────────────────────────────────────────────────
interface SecurityTab {
  id          : string;
  label       : string;
  icon        : React.ElementType;
  color       : string;
  accentBg    : string;
  accentBorder: string;
  description : string;
  properties  : { label: string; value: string }[];
  code        : string;
}

const TABS: SecurityTab[] = [
  {
    id           : "aes",
    label        : "AES-256 Encryption",
    icon         : LockKeyhole,
    color        : "text-violet-400",
    accentBg     : "bg-violet-500/10",
    accentBorder : "border-violet-500/30",
    description  :
      "All patient records and vital-sign payloads are encrypted with AES-256-GCM before persisting to the database. Keys are derived per-patient from a master secret using SHA-256, and GCM authentication tags guarantee ciphertext integrity — any tampering is detected on decryption.",
    properties   : [
      { label: "Algorithm",   value: "AES-256-GCM"         },
      { label: "Key size",    value: "256 bit"              },
      { label: "IV length",   value: "128 bit (randomised)" },
      { label: "Auth tag",    value: "128 bit"              },
      { label: "Key derive",  value: "SHA-256 / patient ID" },
    ],
    code: AES_CODE,
  },
  {
    id           : "blockchain",
    label        : "Blockchain Auth",
    icon         : Link2,
    color        : "text-sky-400",
    accentBg     : "bg-sky-500/10",
    accentBorder : "border-sky-500/30",
    description  :
      "Built on Hyperledger Fabric — every login, logout, token refresh, and MFA challenge is recorded as an immutable block in an append-only SHA-256 hash chain. Each block references the hash of its predecessor, so retroactive modification of any event invalidates the entire chain, providing a tamper-evident, HIPAA-grade authentication audit trail that cannot be silently altered.",
    properties   : [
      { label: "Platform",    value: "Hyperledger Fabric"   },
      { label: "Hash",        value: "SHA-256"              },
      { label: "Consensus",   value: "Proof-of-Work (d=3)"  },
      { label: "Events",      value: "Login, Logout, MFA"   },
      { label: "Verification","value": "Full chain replay"  },
      { label: "Storage",     value: "In-memory + DB sync"  },
    ],
    code: BLOCKCHAIN_CODE,
  },
  {
    id           : "mlnn",
    label        : "MLNN Anomaly Detection",
    icon         : BrainCircuit,
    color        : "text-emerald-400",
    accentBg     : "bg-emerald-500/10",
    accentBorder : "border-emerald-500/30",
    description  :
      "Incoming vital signs are scored in real time by a three-layer neural network trained on 120 k de-identified RPM records. Readings that cross the 0.72 anomaly threshold trigger an alert regardless of static rule outcomes, catching subtle multi-axis deviations that threshold rules miss.",
    properties   : [
      { label: "Architecture", value: "6 → 8 → 4 → 1"      },
      { label: "Activation",   value: "ReLU / Sigmoid"       },
      { label: "Training set", value: "120 k records"        },
      { label: "Threshold",    value: "score > 0.72"         },
      { label: "Inputs",       value: "HR, BP, SpO₂, RR, T°" },
    ],
    code: MLNN_CODE,
  },
  {
    id           : "he",
    label        : "Homomorphic Encryption",
    icon         : KeyRound,
    color        : "text-amber-400",
    accentBg     : "bg-amber-500/10",
    accentBorder : "border-amber-500/30",
    description  :
      "Paillier partial homomorphic encryption lets the analytics layer compute population-level aggregates (averages, sums) over a patient cohort while the server operates entirely on ciphertext — individual readings are never decrypted. Only the authorised key holder can reveal the final aggregate.",
    properties   : [
      { label: "Scheme",      value: "Paillier PHE"          },
      { label: "Property",    value: "Additive homomorphism" },
      { label: "Key size",    value: "≥ 1024 bit (prod)"     },
      { label: "Operations",  value: "Σ over ciphertexts"    },
      { label: "Disclosure",  value: "Aggregate only"        },
    ],
    code: HE_CODE,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SecurityFramework() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const tab = TABS.find((t) => t.id === activeTab)!;
  const Icon = tab.icon;

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Security Framework</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Cryptographic primitives and machine-learning defences active in this system.
              Each layer operates independently — a failure in one does not compromise the others.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400">All systems active</span>
          </div>
        </div>

        {/* ── Stat strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TABS.map((t) => {
            const TIcon = t.icon;
            const isActive = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`
                  flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left
                  ${isActive
                    ? `${t.accentBg} ${t.accentBorder} shadow-sm`
                    : "bg-card border-border hover:bg-muted/50"}
                `}
              >
                <div className={`h-9 w-9 rounded-lg ${isActive ? t.accentBg : "bg-muted"} ${t.accentBorder} border flex items-center justify-center shrink-0`}>
                  <TIcon className={`h-4.5 w-4.5 ${isActive ? t.color : "text-muted-foreground"}`} style={{ height: 18, width: 18 }} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${isActive ? t.color : "text-foreground"}`}>
                    {t.label}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    <span className="text-[10px] text-emerald-400 font-medium">Active</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Detail panel ── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {/* Panel header */}
          <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b border-border ${tab.accentBg}`}>
            <div className="flex items-start gap-4">
              <div className={`h-11 w-11 rounded-xl ${tab.accentBg} border ${tab.accentBorder} flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 ${tab.color}`} />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${tab.color}`}>{tab.label}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mt-1">
                  {tab.description}
                </p>
              </div>
            </div>
            <Badge className={`shrink-0 ${tab.accentBg} ${tab.accentBorder} border ${tab.color} text-[10px] px-2`}>
              ACTIVE
            </Badge>
          </div>

          {/* Properties + Code */}
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
            {/* Properties sidebar */}
            <div className="px-5 py-5 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Configuration
              </p>
              {tab.properties.map((prop) => (
                <div key={prop.label}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{prop.label}</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{prop.value}</p>
                </div>
              ))}
            </div>

            {/* Code display */}
            <div className="p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Implementation
              </p>
              <CodeBlock code={tab.code} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

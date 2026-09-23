import { randomBytes, randomUUID, createHash } from "node:crypto";
import { pool } from "@workspace/db";
import {
  DEFAULT_SETTINGS,
  emptyState,
  type Account,
  type AppState,
  type DocumentMeta,
  type Settings,
} from "../../../../lib/domain/src/index.js";
import { assertStateIntegrity, ValidationError } from "./validation.js";

export interface QueryResult {
  rows: any[];
  rowCount?: number | null;
}
export interface QueryConnection {
  query(sql: string, values?: any[]): Promise<QueryResult>;
  release?: () => void;
}
export interface QueryPool extends QueryConnection {
  connect?: () => Promise<QueryConnection>;
}
export interface SessionRecord {
  account: Account;
  tokenHash: string;
  csrfToken: string;
  expiresAt: string;
}
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
const json = <T>(value: T | string): T =>
  typeof value === "string" ? (JSON.parse(value) as T) : value;
const publicAccount = (row: any): Account => ({
  id: row.id,
  email: row.email,
  name: row.name,
  verified: row.verified === true,
  inboundAddress: row.inbound_address ?? null,
  settings: { ...DEFAULT_SETTINGS, ...json<Settings>(row.settings) },
});

function configuredInboundDomain(): string | null {
  const domain = process.env.INBOUND_DOMAIN?.trim().toLowerCase();
  return domain &&
    /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      domain,
    )
    ? domain
    : null;
}
export class Store {
  private serial: Promise<unknown> = Promise.resolve();
  constructor(private readonly database: QueryPool) {}
  private exclusively<T>(fn: () => Promise<T>): Promise<T> {
    const operation = this.serial.then(fn, fn);
    this.serial = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  query(sql: string, values: any[] = []): Promise<QueryResult> {
    if (this.database.connect) return this.database.query(sql, values);
    return this.exclusively(() => this.database.query(sql, values));
  }
  async transaction<T>(
    fn: (client: QueryConnection) => Promise<T>,
  ): Promise<T> {
    const run = async (client: QueryConnection): Promise<T> => {
      await client.query("BEGIN");
      try {
        const value = await fn(client);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw error;
      }
    };
    if (!this.database.connect)
      return this.exclusively(() => run(this.database));
    const client = await this.database.connect();
    try {
      return await run(client);
    } finally {
      client.release?.();
    }
  }
  async init(): Promise<void> {
    await this.query(`CREATE TABLE IF NOT EXISTS dvy_accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE, inbound_address TEXT UNIQUE, settings JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.query(`CREATE TABLE IF NOT EXISTS dvy_states (
      owner_id TEXT PRIMARY KEY REFERENCES dvy_accounts(id) ON DELETE CASCADE,
      data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.query(`CREATE TABLE IF NOT EXISTS dvy_sessions (
      token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES dvy_accounts(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.query(
      "CREATE INDEX IF NOT EXISTS dvy_sessions_owner ON dvy_sessions(owner_id)",
    );
    await this.query(`CREATE TABLE IF NOT EXISTS dvy_documents (
      owner_id TEXT NOT NULL REFERENCES dvy_accounts(id) ON DELETE CASCADE, id TEXT NOT NULL,
      metadata JSONB NOT NULL, bytes BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(owner_id, id)
    )`);
    await this.query(`CREATE TABLE IF NOT EXISTS dvy_operations (
      owner_id TEXT NOT NULL REFERENCES dvy_accounts(id) ON DELETE CASCADE,
      operation_key TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(owner_id, operation_key)
    )`);
    await this.query(`CREATE TABLE IF NOT EXISTS dvy_account_tokens (
      token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES dvy_accounts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('verify','reset')), expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.query(`CREATE TABLE IF NOT EXISTS dvy_auth_limits (
      key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    )`);
  }
  async createAccount(
    email: string,
    name: string,
    passwordHash: string,
  ): Promise<Account> {
    const id = randomUUID();
    const domain = configuredInboundDomain();
    const inbound = domain
      ? `dvy-${randomBytes(18).toString("hex")}@${domain}`
      : null;
    return this.transaction(async (client) => {
      const result = await client.query(
        "INSERT INTO dvy_accounts(id,email,name,password_hash,inbound_address,settings) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *",
        [
          id,
          email,
          name,
          passwordHash,
          inbound,
          JSON.stringify(DEFAULT_SETTINGS),
        ],
      );
      await client.query(
        "INSERT INTO dvy_states(owner_id,data) VALUES($1,$2::jsonb)",
        [id, JSON.stringify(emptyState())],
      );
      return publicAccount(result.rows[0]);
    });
  }
  private async provisionInbound(account: Account): Promise<Account> {
    const domain = configuredInboundDomain();
    if (!domain || account.inboundAddress?.endsWith(`@${domain}`))
      return account;
    const previous = account.inboundAddress;
    const local =
      previous?.split("@")[0] || `dvy-${randomBytes(18).toString("hex")}`;
    const desired = `${local}@${domain}`;
    // Compare-and-set makes two simultaneous first sessions converge on one alias.
    const result = await this.query(
      "UPDATE dvy_accounts SET inbound_address=$2 WHERE id=$1 AND inbound_address IS NOT DISTINCT FROM $3 RETURNING inbound_address",
      [account.id, desired, previous],
    );
    if (result.rows[0])
      return { ...account, inboundAddress: result.rows[0].inbound_address };
    const current = await this.query(
      "SELECT inbound_address FROM dvy_accounts WHERE id=$1",
      [account.id],
    );
    return {
      ...account,
      inboundAddress: current.rows[0]?.inbound_address ?? previous,
    };
  }
  async getAccount(id: string): Promise<Account | null> {
    const { rows } = await this.query(
      "SELECT id,email,name,verified,inbound_address,settings FROM dvy_accounts WHERE id=$1",
      [id],
    );
    return rows[0] ? this.provisionInbound(publicAccount(rows[0])) : null;
  }
  async getAccountByEmail(email: string): Promise<Account | null> {
    const { rows } = await this.query(
      "SELECT id,email,name,verified,inbound_address,settings FROM dvy_accounts WHERE email=$1",
      [email.toLowerCase()],
    );
    return rows[0] ? this.provisionInbound(publicAccount(rows[0])) : null;
  }
  async credentials(
    email: string,
  ): Promise<{ account: Account; passwordHash: string } | null> {
    const { rows } = await this.query(
      "SELECT * FROM dvy_accounts WHERE email=$1",
      [email.toLowerCase()],
    );
    return rows[0]
      ? {
          account: await this.provisionInbound(publicAccount(rows[0])),
          passwordHash: rows[0].password_hash,
        }
      : null;
  }
  async listAccounts(): Promise<Account[]> {
    const { rows } = await this.query(
      "SELECT id,email,name,verified,inbound_address,settings FROM dvy_accounts ORDER BY created_at,id",
    );
    return Promise.all(
      rows.map((row) => this.provisionInbound(publicAccount(row))),
    );
  }
  async readState(id: string): Promise<AppState> {
    const { rows } = await this.query(
      "SELECT data FROM dvy_states WHERE owner_id=$1",
      [id],
    );
    if (!rows[0]) throw new ValidationError(404, "La cuenta ya no existe.");
    return json<AppState>(rows[0].data);
  }
  async mutateState(
    id: string,
    mutate: (state: AppState) => void | Promise<void>,
    operation?: { key: string; fingerprint: string },
  ): Promise<AppState> {
    return this.transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT data FROM dvy_states WHERE owner_id=$1 FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new ValidationError(404, "La cuenta ya no existe.");
      const state = structuredClone(json<AppState>(rows[0].data));
      const revision = state.revision;
      if (operation) {
        const previous = await client.query(
          "SELECT fingerprint FROM dvy_operations WHERE owner_id=$1 AND operation_key=$2",
          [id, operation.key],
        );
        if (previous.rows[0]) {
          if (previous.rows[0].fingerprint !== operation.fingerprint)
            throw new ValidationError(
              409,
              "Esta operación ya se aplicó con otros datos. Recarga el formulario antes de continuar.",
            );
          return state;
        }
      }
      await mutate(state);
      assertStateIntegrity(state);
      state.revision = revision + 1;
      await client.query(
        "UPDATE dvy_states SET data=$2::jsonb,updated_at=NOW() WHERE owner_id=$1",
        [id, JSON.stringify(state)],
      );
      if (operation)
        await client.query(
          "INSERT INTO dvy_operations(owner_id,operation_key,fingerprint) VALUES($1,$2,$3)",
          [id, operation.key, operation.fingerprint],
        );
      return state;
    });
  }
  async mutateSettings(
    id: string,
    mutate: (previous: Settings) => Settings,
  ): Promise<Account> {
    return this.transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM dvy_accounts WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new ValidationError(404, "La cuenta ya no existe.");
      const settings = mutate(publicAccount(rows[0]).settings);
      const updated = await client.query(
        "UPDATE dvy_accounts SET settings=$2::jsonb WHERE id=$1 RETURNING *",
        [id, JSON.stringify(settings)],
      );
      return publicAccount(updated.rows[0]);
    });
  }
  async createSession(
    ownerId: string,
  ): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 14 * 86400000);
    await this.query("DELETE FROM dvy_sessions WHERE expires_at<NOW()");
    await this.query(
      "INSERT INTO dvy_sessions(token_hash,owner_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
      [hashToken(token), ownerId, csrfToken, expiresAt],
    );
    return { token, csrfToken, expiresAt };
  }
  async getSession(token: string): Promise<SessionRecord | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const tokenHash = hashToken(token);
    const { rows } = await this.query(
      "SELECT a.*,s.csrf_token,s.expires_at FROM dvy_sessions s JOIN dvy_accounts a ON a.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
      [tokenHash],
    );
    return rows[0]
      ? {
          account: await this.provisionInbound(publicAccount(rows[0])),
          tokenHash,
          csrfToken: rows[0].csrf_token,
          expiresAt: String(rows[0].expires_at),
        }
      : null;
  }
  async deleteSession(tokenHash: string): Promise<void> {
    await this.query("DELETE FROM dvy_sessions WHERE token_hash=$1", [
      tokenHash,
    ]);
  }
  async limit(
    key: string,
    max: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const digest = hashToken(key);
    const { rows } = await this.query(
      `INSERT INTO dvy_auth_limits(key,hits,expires_at) VALUES($1,1,NOW()+($2 * INTERVAL '1 second'))
      ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN dvy_auth_limits.expires_at<=NOW() THEN 1 ELSE dvy_auth_limits.hits+1 END,
      expires_at=CASE WHEN dvy_auth_limits.expires_at<=NOW() THEN EXCLUDED.expires_at ELSE dvy_auth_limits.expires_at END RETURNING hits`,
      [digest, windowSeconds],
    );
    // Bounded cleanup without storing addresses or email identifiers in clear text.
    if (rows[0].hits === 1)
      await this.query(
        "DELETE FROM dvy_auth_limits WHERE expires_at<NOW()-INTERVAL '1 day'",
      );
    return rows[0].hits <= max;
  }
  async issueAccountToken(
    ownerId: string,
    kind: "verify" | "reset",
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expiry = new Date(
      Date.now() + (kind === "verify" ? 24 * 3600000 : 30 * 60000),
    );
    await this.transaction(async (client) => {
      // Lock the account first to serialize concurrent token requests.
      const account = await client.query(
        "SELECT id FROM dvy_accounts WHERE id=$1 FOR UPDATE",
        [ownerId],
      );
      if (!account.rows[0])
        throw new ValidationError(404, "La cuenta ya no existe.");
      await client.query(
        "DELETE FROM dvy_account_tokens WHERE owner_id=$1 AND kind=$2",
        [ownerId, kind],
      );
      await client.query(
        "INSERT INTO dvy_account_tokens(token_hash,owner_id,kind,expires_at) VALUES($1,$2,$3,$4)",
        [hashToken(token), ownerId, kind, expiry],
      );
    });
    return token;
  }
  async consumeAccountToken(
    token: string,
    kind: "verify" | "reset",
    passwordHash?: string,
  ): Promise<Account | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    if (kind === "reset" && !passwordHash)
      throw new Error("Password hash required for an atomic reset");
    return this.transaction(async (client) => {
      const { rows } = await client.query(
        "DELETE FROM dvy_account_tokens WHERE token_hash=$1 AND kind=$2 AND expires_at>NOW() RETURNING owner_id",
        [hashToken(token), kind],
      );
      if (!rows[0]) return null;
      const id = rows[0].owner_id;
      const account =
        kind === "verify"
          ? await client.query(
              "UPDATE dvy_accounts SET verified=TRUE WHERE id=$1 RETURNING *",
              [id],
            )
          : await client.query(
              "UPDATE dvy_accounts SET password_hash=$2 WHERE id=$1 RETURNING *",
              [id, passwordHash],
            );
      if (kind === "reset") {
        await client.query("DELETE FROM dvy_sessions WHERE owner_id=$1", [id]);
        await client.query(
          "DELETE FROM dvy_account_tokens WHERE owner_id=$1 AND kind='reset'",
          [id],
        );
      }
      return account.rows[0] ? publicAccount(account.rows[0]) : null;
    });
  }
  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        "UPDATE dvy_accounts SET password_hash=$2 WHERE id=$1",
        [id, passwordHash],
      );
      await client.query("DELETE FROM dvy_sessions WHERE owner_id=$1", [id]);
      await client.query(
        "DELETE FROM dvy_account_tokens WHERE owner_id=$1 AND kind='reset'",
        [id],
      );
    });
  }
  async putDocument(
    ownerId: string,
    meta: DocumentMeta,
    bytes: Buffer,
  ): Promise<DocumentMeta> {
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length < 1 ||
      bytes.length > 10 * 1024 * 1024 ||
      meta.size !== bytes.length
    )
      throw new ValidationError(
        400,
        "El archivo debe tener entre 1 byte y 10 MB.",
      );
    return this.transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT data FROM dvy_states WHERE owner_id=$1 FOR UPDATE",
        [ownerId],
      );
      if (!rows[0]) throw new ValidationError(404, "La cuenta ya no existe.");
      const state = structuredClone(json<AppState>(rows[0].data));
      if (
        meta.purchaseId &&
        !state.purchases.some((p) => p.id === meta.purchaseId)
      )
        throw new ValidationError(404, "El artículo no existe.");
      if (meta.returnId && !state.returns.some((r) => r.id === meta.returnId))
        throw new ValidationError(404, "La devolución no existe.");
      const others = state.documents.filter((d) => d.id !== meta.id);
      if (
        others.length >= 500 ||
        others.reduce((sum, d) => sum + d.size, 0) + bytes.length >
          100 * 1024 * 1024
      )
        throw new ValidationError(
          413,
          "Has alcanzado los 100 MB o 500 documentos de esta cuenta. Elimina archivos que ya no necesites.",
        );
      await client.query(
        "INSERT INTO dvy_documents(owner_id,id,metadata,bytes) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(owner_id,id) DO UPDATE SET metadata=EXCLUDED.metadata,bytes=EXCLUDED.bytes",
        [ownerId, meta.id, JSON.stringify(meta), bytes],
      );
      state.documents = [...others, meta];
      state.revision += 1;
      await client.query(
        "UPDATE dvy_states SET data=$2::jsonb,updated_at=NOW() WHERE owner_id=$1",
        [ownerId, JSON.stringify(state)],
      );
      return meta;
    });
  }
  async readDocument(
    ownerId: string,
    id: string,
  ): Promise<{ meta: DocumentMeta; bytes: Buffer } | null> {
    const { rows } = await this.query(
      "SELECT metadata,bytes FROM dvy_documents WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return rows[0]
      ? {
          meta: json<DocumentMeta>(rows[0].metadata),
          bytes: Buffer.from(rows[0].bytes),
        }
      : null;
  }
  async deleteDocument(ownerId: string, id: string): Promise<void> {
    await this.transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT data FROM dvy_states WHERE owner_id=$1 FOR UPDATE",
        [ownerId],
      );
      if (!rows[0]) throw new ValidationError(404, "La cuenta ya no existe.");
      const state = structuredClone(json<AppState>(rows[0].data));
      if (!state.documents.some((d) => d.id === id))
        throw new ValidationError(404, "El documento ya no existe.");
      state.documents = state.documents.filter((d) => d.id !== id);
      state.revision += 1;
      await client.query(
        "DELETE FROM dvy_documents WHERE owner_id=$1 AND id=$2",
        [ownerId, id],
      );
      await client.query(
        "UPDATE dvy_states SET data=$2::jsonb,updated_at=NOW() WHERE owner_id=$1",
        [ownerId, JSON.stringify(state)],
      );
    });
  }
  async deleteAccount(ownerId: string): Promise<void> {
    await this.query("DELETE FROM dvy_accounts WHERE id=$1", [ownerId]);
  }
}
export const store = new Store(pool as QueryPool);

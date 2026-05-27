/**
 * Worker Client — substitui Appwrite, chama Cloudflare Worker com D1.
 * Mantém interface compatível com o padrão supabase-js usado em App.tsx.
 */

// ── Config ──────────────────────────────────────────────────────────────────
const WORKER_URL = import.meta.env.VITE_WORKER_URL
  ?? 'https://lc131-api.sessp-css2.workers.dev';

// Token usado apenas na função insert() (upload de arquivo no admin panel).
// Defina VITE_IMPORT_TOKEN no arquivo .env.local para habilitar uploads.
const IMPORT_TOKEN = import.meta.env.VITE_IMPORT_TOKEN ?? '';

// ── Core fetch helper ────────────────────────────────────────────────────────
async function workerPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  retries = 2,
): Promise<{ data: T | null; error: { message: string } | null }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${WORKER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as T;
      if (!res.ok) {
        const msg = (json as Record<string, unknown>)?.error as string
          ?? `Worker error ${res.status}`;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        return { data: null, error: { message: msg } };
      }
      return { data: json, error: null };
    } catch (e: unknown) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      return { data: null, error: { message: (e as Error).message ?? 'Network error' } };
    }
  }
  return { data: null, error: { message: 'Max retries exceeded' } };
}

// ── Column name → p_xxx param name mapping (reverse of Worker's PARAM_TO_COL) ──
const COL_TO_PARAM: Record<string, string> = {
  ano_referencia:        'p_ano',
  drs:                   'p_drs',
  regiao_ad:             'p_regiao_ad',
  rras:                  'p_rras',
  regiao_sa:             'p_regiao_sa',
  municipio:             'p_municipio',
  codigo_nome_grupo:     'p_grupo_despesa',
  tipo_despesa:          'p_tipo_despesa',
  rotulo:                'p_rotulo',
  codigo_nome_uo:        'p_uo',
  codigo_nome_elemento:  'p_elemento',
  codigo_nome_favorecido:'p_favorecido',
  codigo_ug:             'p_codigo_ug',
  fonte_simpl:           'p_fonte_recurso',
};

// ── QueryBuilder — fluent interface compatible with supabase-js ──────────────
type AwResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
  count: number | null;
};

class QueryBuilder<T = Record<string, unknown>> {
  private _cols = '*';
  private _countMode = false;
  private _params: Record<string, unknown> = {};
  private _limit  = 500;
  private _offset = 0;
  private _singleMode = false;
  private _insertData: Record<string, unknown>[] | null = null;
  private _yearQuery = false; // special case: select ano_referencia + order + single

  constructor(_table: string) {}

  select(cols: string, _opts?: { count?: string }) {
    this._cols = cols;
    if (_opts?.count) this._countMode = true;
    // Detect year-range pattern
    if (cols.trim() === 'ano_referencia') this._yearQuery = true;
    return this;
  }

  order(field: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    if (field === 'ano_referencia') {
      // store ordering direction for year query
      (this._params as Record<string, unknown>).__yearOrder = opts?.ascending !== false ? 'asc' : 'desc';
    }
    return this;
  }

  limit(n: number) { this._limit = n; return this; }

  range(from: number, to: number) {
    this._offset = from;
    this._limit  = to - from + 1;
    return this;
  }

  eq(field: string, value: unknown) {
    const param = COL_TO_PARAM[field];
    if (param) this._params[param] = value;
    return this;
  }

  in(field: string, values: unknown[]) {
    if (!values || values.length === 0) return this;
    const param = COL_TO_PARAM[field];
    if (param) this._params[param] = (values as string[]).join('|');
    return this;
  }

  // Stub — not used in D1 mode (PostgREST-only)
  or(_expr: string) { return this; }

  single() { this._singleMode = true; this._limit = 1; return this; }

  insert(rows: Record<string, unknown>[]) {
    this._insertData = rows;
    return this;
  }

  then<TResult1 = AwResult<T>>(
    onFulfilled: (v: AwResult<T>) => TResult1,
    onRejected?: (r: unknown) => TResult1,
  ) {
    return this._execute().then(onFulfilled as never, onRejected);
  }

  catch<TResult = never>(onRejected: (r: unknown) => TResult) {
    return this._execute().catch(onRejected);
  }

  private async _execute(): Promise<AwResult<T>> {
    // ── INSERT ──────────────────────────────────────────────────────────────
    if (this._insertData) {
      if (!IMPORT_TOKEN) {
        return {
          data: null,
          error: { message: 'VITE_IMPORT_TOKEN não configurado. Defina no .env.local para habilitar uploads diretos.' },
          count: null,
        };
      }
      const res = await fetch(`${WORKER_URL}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: IMPORT_TOKEN, rows: this._insertData }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (!res.ok) return { data: null, error: { message: String(json.error ?? res.status) }, count: null };
      return { data: this._insertData as unknown as T, error: null, count: null };
    }

    // ── YEAR RANGE QUERY ─────────────────────────────────────────────────────
    // Pattern: .select('ano_referencia').order().limit(1).single()
    if (this._yearQuery && this._singleMode) {
      const res = await fetch(`${WORKER_URL}/api/years`);
      if (!res.ok) return { data: null, error: { message: `Worker /api/years error ${res.status}` }, count: null };
      const years = await res.json() as { min: number | null; max: number | null };
      const order = this._params.__yearOrder;
      const ano   = order === 'asc' ? years.min : (years.max ?? years.min);
      return { data: { ano_referencia: ano } as unknown as T, error: null, count: null };
    }

    // ── COLUMN VALIDATION (limit 1, no filters) ─────────────────────────────
    // Just return empty success — column validation is a D1 no-op
    if (this._limit === 1 && !this._singleMode && Object.keys(this._params).length === 0) {
      return { data: [] as unknown as T, error: null, count: null };
    }

    // ── SELECT / DETAIL ──────────────────────────────────────────────────────
    const body: Record<string, unknown> = {
      ...this._params,
      p_limit:  this._limit,
      p_offset: this._offset,
      action:   'detail',
    };
    delete body.__yearOrder;

    const res = await workerPost<{ rows: unknown[]; total: number }>('/api/detail', body);
    if (res.error) return { data: null, error: res.error, count: null };

    const rows = res.data?.rows ?? [];
    const total = res.data?.total ?? rows.length;

    if (this._singleMode) {
      return { data: (rows[0] ?? null) as T, error: null, count: null };
    }
    return { data: rows as unknown as T, error: null, count: total };
  }
}

// ── RPC name → Worker action mapping ─────────────────────────────────────────
const RPC_MAP: Record<string, string | null> = {
  lc131_dashboard:          'dashboard',
  lc131_map_data:           'map_data',
  lc131_distincts:          'distincts',
  lc131_pivot_multi:        'pivot',
  lc131_delete_year:        'delete_year',
  post_import_cleanup:      null,   // no-op — D1 computes on the fly
  refresh_dashboard_batch:  null,   // no-op
  refresh_bdref_lookup:     null,   // no-op
  get_lc131_id_range:       null,   // no-op
  fix_tipo_despesa_by_year: null,   // no-op
};

// ── Main export (compatible with old appwrite.ts) ────────────────────────────
export const appwrite = {
  from: <T = Record<string, unknown>>(table: string) => new QueryBuilder<T>(table),

  rpc: async (
    fnName: string,
    params?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null; status?: number }> => {
    const action = RPC_MAP[fnName];

    if (action === undefined) {
      console.warn(`[worker-client] Unknown rpc: ${fnName}`);
      return { data: null, error: { message: `Unknown function: ${fnName}` }, status: 404 };
    }

    // No-op stubs
    if (action === null) {
      console.info(`[worker-client] rpc('${fnName}') → no-op in D1 mode`);
      return { data: { ok: true }, error: null, status: 200 };
    }

    const body: Record<string, unknown> = { action, ...(params ?? {}) };

    // delete_year needs the import token
    if (action === 'delete_year') {
      if (!IMPORT_TOKEN) {
        return { data: null, error: { message: 'VITE_IMPORT_TOKEN não configurado.' }, status: 401 };
      }
      body.token = IMPORT_TOKEN;
    }

    const { data, error } = await workerPost(`/api/${action.replace(/_/g, '-')}`, body);
    return { data, error, status: error ? 500 : 200 };
  },
};

// Back-compat: some imports use `import { appwrite as supabase }` pattern
export default appwrite;

// Legacy exports (keep unused but non-breaking)
export const DATABASE_ID = '';
export const databases   = null;
export const appwriteClient = null;

/**
 * Appwrite Client — pure Appwrite, sem Supabase.
 * Exposição de API compatível com o padrão supabase-js usado no App.tsx.
 */

import { Client, Databases, Functions, Query, ID } from 'appwrite';

// ──────────────── Config ────────────────
const ENDPOINT   = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '69ea271e000d28e3afce';

export const DATABASE_ID = '69ea274b00316d3d1dfb';

// Supabase RPC name → Appwrite Function ID
const RPC_MAP: Record<string, string> = {
  lc131_dashboard:         'lc131-dashboard',
  lc131_map_data:          'lc131-map-data',
  lc131_distincts:         'lc131-distincts',
  lc131_pivot_multi:       'lc131-pivot-multi',
  lc131_delete_year:       'lc131-delete-year',
  post_import_cleanup:     'post-import-cleanup',
  refresh_dashboard_batch: 'post-import-cleanup',
  // Stubs — not needed in Appwrite
  refresh_bdref_lookup:    '',
  get_lc131_id_range:      '',
  fix_tipo_despesa_by_year:'',
};

// ──────────────── SDK setup ────────────────
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
export const databases  = new Databases(client);
const fnClient          = new Functions(client);
export const appwriteClient = client;

// ──────────────── Helper ────────────────
function computeFonteSimpl(row: Record<string, unknown>): string {
  const s = String(row.codigo_nome_fonte_recurso ?? row.fonte_recurso ?? '').toLowerCase();
  return (s.includes('fed') || s.includes('uni') || s.includes('fundo nacional') ||
          s.includes('transfe') || s.includes('sus'))
    ? 'FEDERAL' : 'ESTADUAL';
}

function computeGrupoSimpl(row: Record<string, unknown>): string {
  const g = String(row.codigo_nome_grupo ?? '');
  if (g.startsWith('1')) return 'Pessoal';
  if (g.startsWith('2')) return 'Dívida';
  if (g.startsWith('3')) return 'Custeio';
  if (g.startsWith('4')) return 'Investimento';
  return 'Outros';
}

// ──────────────── Fluent query builder ────────────────
type AwResult = {
  data: unknown | null;
  error: { message: string } | null;
  count: number | null;
};

class QueryBuilder {
  private _coll: string;
  private _queries: string[] = [];
  private _lim = 500;
  private _off = 0;
  private _singleMode = false;
  private _insertData: Record<string, unknown>[] | null = null;

  constructor(coll: string) { this._coll = coll; }

  select(_cols: string, _opts?: { count?: string }) {
    return this;
  }

  order(field: string, opts?: { ascending?: boolean }) {
    this._queries.push(
      opts?.ascending === false ? Query.orderDesc(field) : Query.orderAsc(field)
    );
    return this;
  }

  limit(n: number) { this._lim = n; return this; }

  range(from: number, to: number) {
    this._off = from;
    this._lim = to - from + 1;
    return this;
  }

  eq(field: string, value: unknown) {
    this._queries.push(Query.equal(field, value as string));
    return this;
  }

  in(field: string, values: unknown[]) {
    if (values.length === 0) return this;
    this._queries.push(Query.equal(field, values as string[]));
    return this;
  }

  // Stub — PostgREST .or() not supported; App.tsx was updated to use .in('fonte_simpl', ...)
  or(_postgrest: string) {
    console.warn('[appwrite] QueryBuilder.or() called — should not happen in Appwrite mode');
    return this;
  }

  single() { this._singleMode = true; this._lim = 1; return this; }

  insert(rows: Record<string, unknown>[]) {
    this._insertData = rows;
    return this;
  }

  then(
    onFulfilled: (v: AwResult) => unknown,
    onRejected?: (r: unknown) => unknown,
  ) {
    return this._execute().then(onFulfilled, onRejected);
  }

  catch(onRejected: (r: unknown) => unknown) {
    return this._execute().catch(onRejected);
  }

  private async _execute(): Promise<AwResult> {
    if (this._insertData) {
      try {
        for (const rawRow of this._insertData) {
          const row = { ...rawRow } as Record<string, unknown>;
          row.fonte_simpl = computeFonteSimpl(row);
          row.grupo_simpl = computeGrupoSimpl(row);
          if (row.codigo_ug !== undefined && row.codigo_ug !== null) {
            row.codigo_ug = String(row.codigo_ug);
          }
          const docId = (row.$id as string | undefined)
            ?? (row.id !== undefined ? String(row.id) : ID.unique());
          delete row.$id;
          delete row.id;
          await databases.createDocument(DATABASE_ID, this._coll, docId, row);
        }
        return { data: this._insertData, error: null, count: null };
      } catch (e: unknown) {
        return { data: null, error: { message: (e as Error).message }, count: null };
      }
    }

    try {
      const q = [
        ...this._queries,
        Query.limit(this._lim),
        ...(this._off > 0 ? [Query.offset(this._off)] : []),
      ];
      const res = await databases.listDocuments(DATABASE_ID, this._coll, q);
      if (this._singleMode) {
        return { data: res.documents[0] ?? null, error: null, count: null };
      }
      return { data: res.documents, error: null, count: res.total };
    } catch (e: unknown) {
      return { data: null, error: { message: (e as Error).message }, count: null };
    }
  }
}

// ──────────────── Main export ────────────────
export const appwrite = {
  from: (collectionId: string) => new QueryBuilder(collectionId),

  rpc: async (fnName: string, params?: Record<string, unknown>) => {
    const fnId = RPC_MAP[fnName];

    if (fnId === '') {
      console.warn(`[appwrite] rpc('${fnName}') not implemented — stub response`);
      return { data: { ok: true, rows: [] }, error: null, status: 200 };
    }

    if (!fnId) {
      console.warn(`[appwrite] Unknown rpc name: ${fnName}`);
      return { data: null, error: { message: `Unknown function: ${fnName}` }, status: 404 };
    }

    try {
      const execution = await fnClient.createExecution(
        fnId,
        params ? JSON.stringify(params) : '{}',
        false,
        '/',
        'POST' as 'POST',
        {},
      );

      if (execution.responseStatusCode >= 400) {
        let errMsg = `Function ${fnId} returned ${execution.responseStatusCode}`;
        try { errMsg = (JSON.parse(execution.responseBody) as { message?: string })?.message ?? errMsg; } catch { /* ok */ }
        return { data: null, error: { message: errMsg }, status: execution.responseStatusCode };
      }

      let data: unknown;
      try { data = JSON.parse(execution.responseBody); } catch { data = execution.responseBody; }
      return { data, error: null, status: 200 };
    } catch (e: unknown) {
      return { data: null, error: { message: (e as Error).message }, status: 500 };
    }
  },
};

export default appwrite;
export { Query, ID };
export const APPWRITE_CONFIG = {
  DATABASE_ID,
  COLLECTIONS: {
    LC131_DESPESAS: 'lc131_despesas',
    CACHE:          'cache',
    BD_REF:         'bd_ref',
    TAB_DRS:        'tab_drs',
    TAB_RRAS:       'tab_rras',
  },
  FUNCTIONS: {
    LC131_DASHBOARD:  'lc131-dashboard',
    LC131_MAP_DATA:   'lc131-map-data',
    LC131_DISTINCTS:  'lc131-distincts',
    LC131_PIVOT:      'lc131-pivot-multi',
    LC131_DELETE:     'lc131-delete-year',
    POST_CLEANUP:     'post-import-cleanup',
  },
};

/**
 * Appwrite Client Configuration
 * Data source: Supabase (RPC) + Appwrite (future)
 *
 * Configurações Appwrite:
 * - Endpoint: https://fra.cloud.appwrite.io/v1
 * - Project ID: 69ea271e000d28e3afce
 * - Database ID: 69ea274b00316d3d1dfb
 *
 * Supabase (dados ainda aqui):
 * - URL: https://teikzwrfsxjipxozzhbr.supabase.co
 */

import { Client, Databases, Query } from 'appwrite';

// Supabase config – usada para chamadas RPC enquanto dados não migrados
const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';

// Configuração do cliente Appwrite
const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('69ea271e000d28e3afce');

export const appwriteClient = client;
export const databases = new Databases(client);

// IDs de recursos no Appwrite
export const APPWRITE_CONFIG = {
  DATABASE_ID: '69ea274b00316d3d1dfb',
  COLLECTIONS: {
    LC131_DESPESAS: 'lc131_despesas',
    BD_REF: 'bd_ref',
    TAB_DRS: 'tab_drs',
    TAB_RRAS: 'tab_rras',
  },
  FUNCTIONS: {
    LC131_DASHBOARD: 'lc131-dashboard',
    LC131_MAP_DATA: 'lc131-map-data',
    LC131_PIVOT_MULTI: 'lc131-pivot-multi',
    REFRESH_BDREF_LOOKUP: 'refresh-bdref-lookup',
    GET_LC131_ID_RANGE: 'get-lc131-id-range',
    FIX_TIPO_DESPESA: 'fix-tipo-despesa-by-year',
    POST_IMPORT_CLEANUP: 'post-import-cleanup',
    LC131_DELETE_YEAR: 'lc131-delete-year',
    REFRESH_DASHBOARD_BATCH: 'refresh-dashboard-batch',
  },
};

/**
 * Wrapper para manter compatibilidade com API do Supabase
 * Isso permite transição gradual do App.tsx
 */
export const appwrite = {
  /**
   * Simula supabase.from('table').select()
   */
  from: (collectionId: string) => {
    return {
      select: async (columns: string = '*', options?: any) => {
        try {
          const queries: string[] = [];
          
          if (options?.limit) {
            queries.push(Query.limit(options.limit));
          }
          if (options?.offset) {
            queries.push(Query.offset(options.offset));
          }
          if (options?.order) {
            const [field, direction] = typeof options.order === 'string' 
              ? [options.order, 'ASC']
              : [options.order.column || options.order[0], 
                 options.order.ascending === false ? 'DESC' : 'ASC'];
            queries.push(Query.orderBy(field, direction));
          }

          const documents = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID,
            collectionId,
            queries
          );

          return {
            data: documents.documents,
            error: null,
            status: 200,
            statusText: 'OK',
            count: documents.total,
          };
        } catch (error) {
          return {
            data: null,
            error,
            status: 500,
            statusText: 'Error',
          };
        }
      },
      
      insert: async (rows: any[]) => {
        try {
          const results = [];
          for (const row of rows) {
            // Appwrite usa '$id' como ID do documento, mapeia 'id' para '$id' se existir
            const doc = { ...row };
            if (row.id && !row.$id) {
              doc.$id = String(row.id);
            }
            
            const created = await databases.createDocument(
              APPWRITE_CONFIG.DATABASE_ID,
              collectionId,
              doc.$id || 'unique()',
              doc
            );
            results.push(created);
          }

          return {
            data: results,
            error: null,
            status: 201,
            statusText: 'Created',
          };
        } catch (error) {
          return {
            data: null,
            error,
            status: 500,
            statusText: 'Error',
          };
        }
      },

      delete: async (filterFn?: (doc: any) => boolean) => {
        try {
          const { documents } = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID,
            collectionId,
            [Query.limit(1000)] // Appwrite limita a 100/1000 docs por request
          );

          for (const doc of documents) {
            if (!filterFn || filterFn(doc)) {
              await databases.deleteDocument(
                APPWRITE_CONFIG.DATABASE_ID,
                collectionId,
                doc.$id
              );
            }
          }

          return {
            data: { deleted: documents.length },
            error: null,
            status: 200,
            statusText: 'OK',
          };
        } catch (error) {
          return {
            data: null,
            error,
            status: 500,
            statusText: 'Error',
          };
        }
      },

      order: async (column: string, options?: any) => {
        // Implementar ordenação
        return this.select('*', {
          order: { column, ascending: options?.ascending !== false },
        });
      },

      limit: async (count: number) => {
        return this.select('*', { limit: count });
      },

      single: async () => {
        const result = await this.select('*', { limit: 1 });
        return {
          data: result.data?.[0] || null,
          error: result.error,
        };
      },

      count: async (options?: any) => {
        try {
          const response = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID,
            collectionId,
            [Query.limit(1)]
          );

          return {
            data: null,
            count: response.total,
            error: null,
          };
        } catch (error) {
          return {
            data: null,
            count: null,
            error,
          };
        }
      },
    };
  },

  /**
   * Simula supabase.rpc('function_name', { param1: value1, ... })
   * Chama Supabase REST API diretamente (dados ainda estão lá).
   * Quando as Appwrite Functions forem deployadas, basta trocar a URL.
   */
  rpc: async (functionName: string, params?: Record<string, any>) => {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(params || {}),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          data: null,
          error: data,
          status: response.status,
        };
      }

      return {
        data,
        error: null,
        status: 200,
      };
    } catch (error) {
      return {
        data: null,
        error,
        status: 500,
      };
    }
  },
};

export default appwrite;

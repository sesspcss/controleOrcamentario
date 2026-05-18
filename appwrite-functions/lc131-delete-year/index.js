/**
 * Appwrite Function: lc131-delete-year
 * 
 * Equivalente à RPC SQL do Supabase: lc131_delete_year
 * 
 * Deleta todos os registros de um ano específico
 * 
 * Parâmetros:
 * {
 *   "p_ano": 2024
 * }
 */

const { Client, Databases, Query } = require('appwrite');

module.exports = async function(req, res) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_PROJECT || '69ea271e000d28e3afce')
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  try {
    const { p_ano } = req.body;

    if (!p_ano) {
      return res.json({ error: 'p_ano é obrigatório' }, 400);
    }

    console.log(`Deletando registros do ano ${p_ano}...`);

    let totalDeleted = 0;
    const BATCH_SIZE = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        // Buscar registros do ano (em lotes)
        const response = await databases.listDocuments(
          process.env.APPWRITE_DATABASE || 'database-69ea274b00316d3d1dfb',
          'lc131_despesas',
          [
            Query.equal('ano_referencia', p_ano),
            Query.limit(BATCH_SIZE)
          ]
        );

        if (response.documents.length === 0) {
          hasMore = false;
          break;
        }

        // Deletar cada documento
        for (const doc of response.documents) {
          try {
            await databases.deleteDocument(
              process.env.APPWRITE_DATABASE || 'database-69ea274b00316d3d1dfb',
              'lc131_despesas',
              doc.$id
            );
            totalDeleted++;
          } catch (err) {
            console.error(`Erro ao deletar doc ${doc.$id}:`, err.message);
          }
        }

        console.log(`Deletados até agora: ${totalDeleted}`);

        if (response.documents.length < BATCH_SIZE) {
          hasMore = false;
        }
      } catch (err) {
        console.error('Erro em batch de deleção:', err.message);
        hasMore = false;
      }
    }

    return res.json({
      success: true,
      message: `${totalDeleted} registros deletados do ano ${p_ano}`,
      total_deleted: totalDeleted,
    });
  } catch (error) {
    console.error('Erro em lc131_delete_year:', error);
    return res.json({ error: error.message }, 500);
  }
};

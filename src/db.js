const { createClient } = require('@tursodatabase/serverless/compat');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('❌ محتاج تحط TURSO_DATABASE_URL و TURSO_AUTH_TOKEN في ملف .env (خدهم من turso.tech)');
  process.exit(1);
}

const client = createClient({ url, authToken });

/** يرجع أول صف بس (أو undefined لو مفيش نتائج) */
async function get(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows[0];
}

/** يرجع كل الصفوف */
async function all(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows;
}

/** لـ INSERT/UPDATE/DELETE - بيرجع lastInsertRowid و changes */
async function run(sql, args = []) {
  const res = await client.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
    changes: res.rowsAffected,
  };
}

/** لتنفيذ أكتر من statement مرة واحدة (زي ملف الـ schema) */
async function exec(sql) {
  return client.executeMultiple(sql);
}

/**
 * تنفيذ عدة عمليات كوحدة واحدة (transaction حقيقي).
 * fn بتاخد كائن فيه get/all/run بتشتغل جوه نفس المعاملة.
 */
async function withTransaction(fn) {
  const tx = await client.transaction('write');
  try {
    const txHelpers = {
      get: async (sql, args = []) => (await tx.execute({ sql, args })).rows[0],
      all: async (sql, args = []) => (await tx.execute({ sql, args })).rows,
      run: async (sql, args = []) => {
        const res = await tx.execute({ sql, args });
        return {
          lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
          changes: res.rowsAffected,
        };
      },
    };
    const result = await fn(txHelpers);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { client, get, all, run, exec, withTransaction };

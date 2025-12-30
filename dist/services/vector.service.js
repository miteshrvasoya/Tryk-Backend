"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProductEmbedding = exports.findProductMatch = void 0;
const db_1 = require("../db");
// In a real app, we would import OpenAI or similar to generate embeddings
// import { generateEmbedding } from './ai.service'; 
const findProductMatch = async (embedding, shopId) => {
    // Using pgvector's <=> operator for cosine distance (or <-> for L2)
    // 1 - <=> gives cosine similarity if vectors are normalized
    const text = `
    SELECT *, 1 - (embedding <=> $1) as similarity
    FROM products
    WHERE shop_id = $2
    ORDER BY similarity DESC
    LIMIT 5
  `;
    // pgvector requires string representation for the vector in SQL usually, or array if the driver supports it.
    // pg-vector library helps here, or just formatting it.
    // '[1,2,3]'
    const vectorStr = `[${embedding.join(',')}]`;
    const result = await (0, db_1.query)(text, [vectorStr, shopId]);
    return result.rows;
};
exports.findProductMatch = findProductMatch;
const updateProductEmbedding = async (productId, embedding) => {
    const vectorStr = `[${embedding.join(',')}]`;
    await (0, db_1.query)('UPDATE products SET embedding = $1 WHERE id = $2', [vectorStr, productId]);
};
exports.updateProductEmbedding = updateProductEmbedding;

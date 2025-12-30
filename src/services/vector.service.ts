import { query } from '../db';
// In a real app, we would import OpenAI or similar to generate embeddings
// import { generateEmbedding } from './ai.service'; 

export const findProductMatch = async (embedding: number[], shopId: string) => {
  // Vector search temporarily disabled (pgvector missing)
  console.warn("Vector search disabled: pgvector extension not found.");
  return []; 
  
  /* 
  // Using pgvector's <=> operator for cosine distance (or <-> for L2)
  const text = `
    SELECT *, 1 - (embedding <=> $1) as similarity
    FROM products
    WHERE shop_id = $2
    ORDER BY similarity DESC
    LIMIT 5
  `;
  const vectorStr = `[${embedding.join(',')}]`;
  const result = await query(text, [vectorStr, shopId]);
  return result.rows;
  */
};

export const updateProductEmbedding = async (productId: number, embedding: number[]) => {
    const vectorStr = `[${embedding.join(',')}]`;
    await query('UPDATE products SET embedding = $1 WHERE id = $2', [vectorStr, productId]);
};

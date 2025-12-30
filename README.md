# Tryk Backend

This is the backend service for Tryk, an AI-powered support chatbot.

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Variables**
    Copy `.env` from `.env.example` (or use the created `.env`) and fill in your keys:
    - `DATABASE_URL`: PostgreSQL connection string.
    - `ANTHROPIC_API_KEY`: API key for Claude.
    - `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`: Shopify App credentials.

3.  **Database Migration**
    Run the schema SQL in your PostgreSQL database:
    ```bash
    psql $DATABASE_URL -f src/db/schema.sql
    ```

4.  **Build and Run**
    ```bash
    npm run build
    npm start
    ```
    
    For development:
    ```bash
    npm run dev
    ```

## Architecture

-   **API Gateway**: `src/controllers/webhook.controller.ts` handles Shopify and Email webhooks.
-   **Services**:
    -   `support.service.ts`: Orchestrates the message flow.
    -   `ai.service.ts`: Interfaces with Claude for intent classification and response generation.
    -   `shopify.service.ts`: Wraps Shopify Admin API.
    -   `vector.service.ts`: Handles product search using `pgvector`.
    -   `return.service.ts`: Manages return logic.

## Logic Flow

1.  Webhook receives message.
2.  `SupportService` classifies intent (Order Status, Product Question, etc.).
3.  Appropriate service is called (e.g., fetch order, search products).
4.  AI generates a natural language response with the context.
5.  Response is logged/sent back (Implementation of sending back to Shopify is pending integration details).

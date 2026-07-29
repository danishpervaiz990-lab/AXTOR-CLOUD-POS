export const developerApiSpec = Object.freeze({
  openapi: "3.1.0",
  info: {
    title: "Axtor POS Cloud Developer API",
    version: "1.0.0",
    description: "Tenant-scoped read API for approved Axtor integrations. API keys are created and revoked by authorized tenant administrators.",
  },
  servers: [
    { url: "https://axtor-cloud-pos-production.up.railway.app", description: "Production" },
  ],
  components: {
    securitySchemes: {
      ApiKeyHeader: { type: "apiKey", in: "header", name: "X-API-Key" },
      ApiKeyAuthorization: { type: "apiKey", in: "header", name: "Authorization", description: "Use `ApiKey <secret>`." },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          ok: { type: "boolean", const: false },
          error: {
            type: "object",
            properties: { message: { type: "string" }, details: { type: ["object", "null"], additionalProperties: true } },
            required: ["message"],
          },
        },
        required: ["ok", "error"],
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string" }, sku: { type: "string" }, barcode: { type: ["string", "null"] }, qrCode: { type: ["string", "null"] },
          name: { type: "string" }, category: { type: ["string", "null"] }, brand: { type: ["string", "null"] }, unit: { type: ["string", "null"] },
          price: { type: "string", description: "Decimal selling price." }, currentStock: { type: "string", description: "Decimal current stock." },
          imageUrl: { type: ["string", "null"] }, updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "sku", "name", "price", "currentStock", "updatedAt"],
      },
    },
  },
  paths: {
    "/api/v1/developer/openapi.json": {
      get: {
        summary: "Developer API OpenAPI contract",
        security: [],
        responses: { "200": { description: "OpenAPI document" } },
      },
    },
    "/api/v1/developer/status": {
      get: {
        summary: "Verify API key and tenant context",
        security: [{ ApiKeyHeader: [] }, { ApiKeyAuthorization: [] }],
        responses: {
          "200": { description: "Authenticated tenant and key context" },
          "401": { description: "Missing, invalid, expired or revoked key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Scope denied or business inactive", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/developer/products": {
      get: {
        summary: "List active tenant products",
        security: [{ ApiKeyHeader: [] }, { ApiKeyAuthorization: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
          { name: "search", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "updatedAfter", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": {
            description: "Product list",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean", const: true }, data: { type: "array", items: { $ref: "#/components/schemas/Product" } }, meta: { type: "object" } }, required: ["ok", "data", "meta"] } } },
          },
          "400": { description: "Invalid query", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing, invalid, expired or revoked key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Scope denied", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
  },
});

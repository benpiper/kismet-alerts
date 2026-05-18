---
name: fastify-best-practices
description: "Guides development of Fastify Node.js backend servers and REST APIs using TypeScript or JavaScript. Use when building, configuring, or debugging a Fastify application — including defining routes, implementing plugins, setting up JSON Schema validation, handling errors, optimising performance, managing authentication, configuring CORS and security headers, integrating databases, working with WebSockets, and deploying to production. Covers the full Fastify request lifecycle (hooks, serialization, logging with Pino) and TypeScript integration via strip types. Trigger terms: Fastify, Node.js server, REST API, API routes, backend framework, fastify.config, server.ts, app.ts."
metadata:
  tags: fastify, nodejs, typescript, backend, api, server, http
---

## Quick Start

Minimal server:

```ts
import Fastify from 'fastify'
const app = Fastify({ logger: true })
app.get('/health', async () => ({ status: 'ok' }))
await app.listen({ port: 3000, host: '0.0.0.0' })
```

Plugin with shared decorators via `fastify-plugin` (escapes encapsulation):

```ts
import fp from 'fastify-plugin'

export default fp(async function dbPlugin(app, options) {
  const db = await createConnection(options.connectionString)
  app.decorate('db', db)
  app.addHook('onClose', async () => db.close())
}, { name: 'db-plugin' })
```

Route with TypeBox schema validation (preferred over raw JSON Schema):

```ts
import { Type, type Static } from '@sinclair/typebox'

const Body = Type.Object({ name: Type.String({ minLength: 1 }) })
type BodyType = Static<typeof Body>

app.post<{ Body: BodyType }>('/users', {
  schema: { body: Body, response: { 201: Type.Object({ id: Type.String() }) } }
}, async (request, reply) => {
  reply.code(201)
  return { id: await createUser(request.body) }
})
```

## Recommended Reading Order for Common Scenarios

- **New to Fastify?** Start with `plugins.md` → `routes.md` → `schemas.md`
- **Adding authentication:** `plugins.md` → `hooks.md` → `authentication.md`
- **Improving performance:** `schemas.md` → `serialization.md` → `performance.md`
- **Setting up testing:** `routes.md` → `testing.md`
- **Going to production:** `logging.md` → `configuration.md` → `deployment.md`

## How to use

Read individual rule files for detailed explanations and code examples:

- [rules/plugins.md](rules/plugins.md) - Plugin development and encapsulation
- [rules/routes.md](rules/routes.md) - Route organization and handlers
- [rules/schemas.md](rules/schemas.md) - JSON Schema validation
- [rules/error-handling.md](rules/error-handling.md) - Error handling patterns
- [rules/hooks.md](rules/hooks.md) - Hooks and request lifecycle
- [rules/authentication.md](rules/authentication.md) - Authentication and authorization
- [rules/testing.md](rules/testing.md) - Testing with inject()
- [rules/performance.md](rules/performance.md) - Performance optimization
- [rules/logging.md](rules/logging.md) - Logging with Pino
- [rules/typescript.md](rules/typescript.md) - TypeScript integration
- [rules/decorators.md](rules/decorators.md) - Decorators and extensions
- [rules/content-type.md](rules/content-type.md) - Content type parsing
- [rules/serialization.md](rules/serialization.md) - Response serialization
- [rules/cors-security.md](rules/cors-security.md) - CORS and security headers
- [rules/websockets.md](rules/websockets.md) - WebSocket support
- [rules/database.md](rules/database.md) - Database integration patterns
- [rules/configuration.md](rules/configuration.md) - Application configuration
- [rules/deployment.md](rules/deployment.md) - Production deployment
- [rules/http-proxy.md](rules/http-proxy.md) - HTTP proxying and reply.from()


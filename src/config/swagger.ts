export function getSwaggerSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'Research CRM API', version: '1.0.0', description: 'Backend API для CRM системы' },
    servers: [{ url: `/api`, description: 'API Base' }],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          description: 'Returns 200 if server and DB are OK, 503 if DB is unavailable',
          responses: { 200: { description: 'OK' }, 503: { description: 'Service Unavailable' } },
        },
      },
      '/auth/login': {
        post: {
          summary: 'Login',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: { email: { type: 'string' }, password: { type: 'string' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Token and user' }, 401: { description: 'Invalid credentials' } },
        },
      },
      '/auth/register': {
        post: {
          summary: 'Register',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'email', 'password'],
                  properties: {
                    username: { type: 'string' },
                    email: { type: 'string' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
        },
      },
      '/casinos': {
        get: { summary: 'List casinos', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
        post: {
          summary: 'Create casino',
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
              },
            },
          },
          responses: { 201: { description: 'Created' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
}

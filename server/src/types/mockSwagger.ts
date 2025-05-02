//TODO: отревьюить это
export interface SwaggerSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  properties?: { [key: string]: SwaggerSchema };
  items?: SwaggerSchema;
  example?: any;
  required?: string[];
  $ref?: string;
}
//TODO: отревьюить это
export interface SwaggerParameter {
  name: string;
  in: 'query' | 'path' | 'body';
  description?: string;
  required?: boolean;
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  schema?: SwaggerSchema;
}
//TODO: отревьюить это
export interface SwaggerMethod {
  summary?: string;
  produces?: string[];
  parameters?: SwaggerParameter[];
  responses?: {
    [statusCode: string]: {
      description: string;
      schema?: SwaggerSchema | { $ref: string };
    };
  };
}
//TODO: отревьюить это
export interface SwaggerPath {
  [path: string]: {
    [method: string]: SwaggerMethod;
  };
}
//TODO: отревьюить это
export const mockSwagger: SwaggerPath = {
  '/api/users': {
    get: {
      summary: 'Get list of users',
      produces: ['application/json'],
      parameters: [],
      responses: {
        '200': {
          description: 'List of users'
        }
      }
    },
    post: {
      summary: 'Create new user',
      produces: ['application/json'],
      parameters: [
        {
          name: 'body',
          in: 'body',
          description: 'User data',
          required: true,
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', example: 'john_doe' },
              email: { type: 'string', example: 'john@example.com' },
              age: { type: 'integer', example: 30 }
            },
            required: ['username', 'email']
          }
        }
      ],
      responses: {
        '201': { description: 'User created' }
      }
    },
    delete: {
      summary: 'Delete all users',
      produces: ['application/json'],
      parameters: [],
      responses: {
        '200': { description: 'All users deleted' }
      }
    }
  },
  '/api/reports': {
    put: {
      summary: 'Replace full report',
      produces: ['application/json'],
      parameters: [
        {
          name: 'body',
          in: 'body',
          description: 'New report data',
          required: true,
          schema: {
            type: 'object',
            properties: {
              reportName: { type: 'string', example: 'Annual Report' },
              year: { type: 'integer', example: 2024 },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    metric: { type: 'string', example: 'Revenue' },
                    value: { type: 'number', example: 100000 }
                  },
                  required: ['metric', 'value']
                }
              }
            },
            required: ['reportName', 'year', 'data']
          }
        }
      ],
      responses: {
        '200': { description: 'Report updated' }
      }
    },
    get: {
      summary: 'Get all reports',
      produces: ['application/json'],
      parameters: [],
      responses: {
        '200': { description: 'List of reports' }
      }
    }
  },
  '/api/data': {
    get: {
      summary: 'Get data by id',
      produces: ['application/json'],
      parameters: [
        {
          name: 'id',
          in: 'query',
          description: 'Data ID',
          required: true,
          type: 'string'
        }
      ],
      responses: {
        '200': { description: 'Data returned' },
        '404': { description: 'Data not found' }
      }
    },
    patch: {
      summary: 'Update data partially',
      produces: ['application/json'],
      parameters: [
        {
          name: 'id',
          in: 'query',
          description: 'Data ID to update',
          required: true,
          type: 'string'
        },
        {
          name: 'body',
          in: 'body',
          description: 'Partial data to update',
          required: true,
          schema: {
            type: 'object',
            properties: {
              value: { type: 'string', example: 'new value' }
            }
          }
        }
      ],
      responses: {
        '200': { description: 'Data updated' }
      }
    }
  },
  '/api/settings': {
    patch: {
      summary: 'Update settings',
      produces: ['application/json'],
      parameters: [
        {
          name: 'body',
          in: 'body',
          description: 'Settings patch object',
          required: true,
          schema: {
            type: 'object',
            properties: {
              theme: { type: 'string', example: 'dark' },
              notificationsEnabled: { type: 'boolean', example: true }
            }
          }
        }
      ],
      responses: {
        '200': { description: 'Settings updated' }
      }
    }
  },
  '/api/products/{productId}': {
    get: {
      summary: 'Get product by ID',
      produces: ['application/json'],
      parameters: [
        {
          name: 'productId',
          in: 'path',
          description: 'Product ID',
          required: true,
          type: 'string'
        }
      ],
      responses: {
        '200': { description: 'Product found' },
        '404': { description: 'Product not found' }
      }
    },
    put: {
      summary: 'Update product by ID',
      produces: ['application/json'],
      parameters: [
        {
          name: 'productId',
          in: 'path',
          description: 'Product ID',
          required: true,
          type: 'string'
        },
        {
          name: 'body',
          in: 'body',
          description: 'Product details to update',
          required: true,
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'New Product Name' },
              price: { type: 'number', example: 99.99 }
            },
            required: ['name', 'price']
          }
        }
      ],
      responses: {
        '200': { description: 'Product updated' }
      }
    }
  }
};
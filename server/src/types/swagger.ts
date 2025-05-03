/**
 * @module swagger
 * @description Defines the interfaces and mock data for the Swagger specification.
 */

/**
 * Interface representing a Swagger Schema.
 * @interface SwaggerSchema
 * @property {'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer'} type - The data type.
 * @property {Object.<string, SwaggerSchema>} [properties] - Properties for 'object' type.
 * @property {SwaggerSchema} [items] - Items for 'array' type.
 * @property {string[]} [required] - Array of required property names.
 * @property {*} [example] - An example value for the schema.
 * @property {string} [description] - A description of the schema.
 */
export interface SwaggerSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer';
  properties?: { [key: string]: SwaggerSchema };
  items?: SwaggerSchema;
  required?: string[];
  example?: any;
  description?: string;
}

/**
 * Interface representing a Swagger Parameter.
 * @interface SwaggerParameter
 * @property {'query' | 'header' | 'path' | 'cookie' | 'body'} in - The location of the parameter.
 * @property {string} name - The name of the parameter.
 * @property {boolean} [required] - Whether the parameter is required.
 * @property {SwaggerSchema} [schema] - The schema for the parameter.
 * @property {string} [description] - A description of the parameter.
 */
export interface SwaggerParameter {
  in: 'query' | 'header' | 'path' | 'cookie' | 'body';
  name: string;
  required?: boolean;
  schema?: SwaggerSchema;
  description?: string;
}

/**
 * Interface representing a Swagger Method (GET, POST, etc.).
 * @interface SwaggerMethod
 * @property {SwaggerParameter[]} [parameters] - List of parameters for the method.
 * @property {string} [description] - A description of the method.
 */
export interface SwaggerMethod {
  parameters?: SwaggerParameter[];
  description?: string;
}

/**
 * Interface representing a Swagger Path, containing available HTTP methods for a URL.
 * @interface SwaggerPath
 * @property {SwaggerMethod} [get] - GET method details.
 * @property {SwaggerMethod} [post] - POST method details.
 * @property {SwaggerMethod} [put] - PUT method details.
 * @property {SwaggerMethod} [delete] - DELETE method details.
 * @property {SwaggerMethod} [patch] - PATCH method details.
 */
export interface SwaggerPath {
  get?: SwaggerMethod;
  post?: SwaggerMethod;
  put?: SwaggerMethod;
  delete?: SwaggerMethod;
  patch?: SwaggerMethod;
}

/**
 * Mock Swagger specification object.
 * @constant {Object.<string, SwaggerPath>} mockSwagger
 */
export const mockSwagger: { [key: string]: SwaggerPath } = {
  '/api/users': {
    get: {
      parameters: [
        { in: 'query', name: 'id', schema: { type: 'number', example: 1 }, description: 'User ID' }
      ],
      description: 'Get a list of users'
    },
    post: {
      parameters: [
        {
          in: 'body',
          name: 'user',
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', example: 'john_doe', description: 'Unique username' },
              email: { type: 'string', example: 'john@example.com', description: 'User email' },
              age: { type: 'integer', example: 30, description: 'User age' },
              optionalUserInfo: { type: 'string', example: 'Some additional info', description: 'Optional user information' }
            },
            required: ['username', 'email'],
            description: 'User object to be created'
          },
          description: 'User data'
        }
      ],
      description: 'Create a new user'
    }
  },
  '/api/users/{userId}': {
    get: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user' }
      ],
      description: 'Get user by ID'
    },
    put: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user to update' },
        {
          in: 'body',
          name: 'user',
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', example: 'john_doe', description: 'Unique username' },
              email: { type: 'string', example: 'john@example.com', description: 'User email' },
              age: { type: 'integer', example: 30, description: 'User age' },
              optionalUpdateField: { type: 'string', example: 'Optional field to update' }
            },
            required: [],
            description: 'Updated user object'
          },
          description: 'Updated user data'
        }
      ],
      description: 'Update a user by ID'
    },
    delete: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user to delete' }
      ],
      description: 'Delete a user by ID'
    }
  },
  '/api/users/{userId}/stats': {
    get: {
      parameters: [
        { in: 'path', name: 'userId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the user' }
      ],
      description: 'Get user statistics by ID'
    }
  },
  '/api/products': {
    get: {
      parameters: [
        { in: 'query', name: 'search', schema: { type: 'string', example: 'product name' }, description: 'Search term for products' }
      ],
      description: 'Get a list of products'
    },
    post: {
      parameters: [
        {
          in: 'body',
          name: 'product',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'New Product', description: 'Product name' },
              price: { type: 'number', example: 9.99, description: 'Product price' },
              category: { type: 'string', example: 'Electronics', description: 'Optional product category' }
            },
            required: ['name', 'price'],
            description: 'Product object to be created'
          },
          description: 'Product data'
        }
      ],
      description: 'Create a new product'
    }
  },
  '/api/products/{productId}': {
    get: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product' }
      ],
      description: 'Get product by ID'
    },
    put: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product to update' },
        {
          in: 'body',
          name: 'product',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Updated Product', description: 'Updated product name' },
              price: { type: 'number', example: 19.99, description: 'Updated product price' },
              available: { type: 'boolean', example: true, description: 'Optional availability status' }
            },
            required: [],
            description: 'Updated product object'
          },
          description: 'Updated product data'
        }
      ],
      description: 'Update a product by ID'
    },
    delete: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product to delete' }
      ],
      description: 'Delete a product by ID'
    }
  },
  '/api/products/{productId}/reviews': {
    get: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product' }
      ],
      description: 'Get reviews for a product'
    },
    post: {
      parameters: [
        { in: 'path', name: 'productId', required: true, schema: { type: 'integer', example: 1 }, description: 'The ID of the product' },
        {
          in: 'body',
          name: 'review',
          schema: {
            type: 'object',
            properties: {
              author: { type: 'string', example: 'Anonymous', description: 'Author of the review' },
              rating: { type: 'integer', example: 5, description: 'Rating from 1 to 5' },
              comment: { type: 'string', example: 'Great product!', description: 'Review comment' },
              imageUrls: {
                type: 'array',
                items: { type: 'string', example: 'http://example.com/image1.jpg' },
                description: 'Optional image URLs for the review'
              }
            },
            required: ['author', 'rating', 'comment'],
            description: 'Review object to be submitted'
          },
          description: 'Review data'
        }
      ],
      description: 'Submit a review for a product'
    }
  },
  '/api/orders': {
    get: {
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string', example: 'pending' }, description: 'Filter orders by status' }
      ],
      description: 'Get a list of orders'
    },
    post: {
      parameters: [
        {
          in: 'body',
          name: 'order',
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    productId: { type: 'integer', example: 1, description: 'Product ID' },
                    quantity: { type: 'integer', example: 1, description: 'Quantity' }
                  },
                  required: ['productId', 'quantity']
                },
                description: 'List of items in the order'
              },
              customerInfo: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'John Doe', description: 'Customer name' },
                  address: { type: 'string', example: '123 Main St', description: 'Customer address' },
                  phone: { type: 'string', example: '123-456-7890', description: 'Optional customer phone number' }
                },
                required: ['name', 'address'],
                description: 'Customer information'
              }
            },
            required: ['items', 'customerInfo'],
            description: 'Order object to be created'
          },
          description: 'Order data'
        }
      ],
      description: 'Create a new order'
    }
  },
  '/api/orders/{orderId}': {
    get: {
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'integer', example: 123 }, description: 'The ID of the order' }
      ],
      description: 'Get order by ID'
    },
    delete: {
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'integer', example: 123 }, description: 'The ID of the order to delete' }
      ],
      description: 'Delete an order by ID'
    }
  },
  '/api/profile': {
    get: {
      description: 'Get the current user profile'
    },
    put: {
      parameters: [
        {
          in: 'body',
          name: 'profile',
          schema: {
            type: 'object',
            properties: {
              firstName: { type: 'string', example: 'John', description: 'User first name' },
              lastName: { type: 'string', example: 'Doe', description: 'User last name' },
              phone: { type: 'string', example: '123-456-7890', description: 'User phone number' },
              website: { type: 'string', example: 'http://example.com', description: 'Optional website' }
            },
            required: ['firstName', 'lastName'],
            description: 'Updated user profile data'
          },
          description: 'User profile data'
        }
      ],
      description: 'Update the current user profile'
    }
  },
  '/api/admin/dashboard': {
    get: {
      description: 'Get data for the admin dashboard (requires admin privileges)'
    }
  }
};
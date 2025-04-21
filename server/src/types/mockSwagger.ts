interface SwaggerPath {
    [path: string]: {
      [method: string]: {
        summary?: string;
        parameters?: Array<{
          name: string;
          in: string;
          type: string;
        }>;
      };
    };
  }
  
export const mockSwagger: SwaggerPath = {
    '/api/data': {
      'get': {
        summary: 'Get data',
        parameters: [
          { name: 'id', in: 'query', type: 'string' }
        ]
      }
    },
    '/api/users': {
      'post': {
        summary: 'Create user'
      },
      'get': {
        summary: 'Get users'
      }
    }
  };
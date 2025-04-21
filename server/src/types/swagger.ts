export interface SwaggerMethod {
    summary?: string;
  }
  
  export type SwaggerPath = Record<string, SwaggerMethod>;
  export type SwaggerDoc = Record<string, SwaggerPath>;
  
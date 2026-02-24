/**
 * Common pagination and filtering types
 */

// Pagination request parameters
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

// Filter operators
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';

// Single filter condition
export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Query parameters from request
export interface QueryParams extends PaginationParams {
  search?: string;
  filters?: Record<string, unknown>;
}

// Default values
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

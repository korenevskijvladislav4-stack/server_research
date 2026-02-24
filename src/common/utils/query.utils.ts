/**
 * Utility functions for building SQL queries
 */

import { Request } from 'express';
import {
  PaginationParams,
  QueryParams,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../types/pagination.types';

/**
 * Parse pagination parameters from request query
 */
export function parsePaginationParams(query: Request['query']): PaginationParams {
  const page = Math.max(1, parseInt(query.page as string) || DEFAULT_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.pageSize as string) || DEFAULT_PAGE_SIZE)
  );
  const sortField = query.sortField as string | undefined;
  const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';

  return { page, pageSize, sortField, sortOrder };
}

/**
 * Parse all query parameters including filters
 */
export function parseQueryParams(query: Request['query']): QueryParams {
  const pagination = parsePaginationParams(query);
  const search = query.search as string | undefined;
  
  // Parse filters from query (format: filter_fieldName=value)
  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('filter_') && value !== undefined && value !== '') {
      const fieldName = key.replace('filter_', '');
      filters[fieldName] = value;
    }
  }

  return { ...pagination, search, filters };
}

/**
 * Build WHERE clause from filters
 */
export function buildWhereClause(
  filters: Record<string, unknown>,
  allowedFields: string[],
  tableAlias?: string
): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const prefix = tableAlias ? `${tableAlias}.` : '';

  for (const [field, value] of Object.entries(filters)) {
    if (!allowedFields.includes(field) || value === undefined || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      // IN clause
      if (value.length > 0) {
        conditions.push(`${prefix}${field} IN (?)`);
        params.push(value);
      }
    } else if (typeof value === 'boolean') {
      conditions.push(`${prefix}${field} = ?`);
      params.push(value ? 1 : 0);
    } else if (value === 'null') {
      conditions.push(`${prefix}${field} IS NULL`);
    } else if (value === 'not_null') {
      conditions.push(`${prefix}${field} IS NOT NULL`);
    } else {
      conditions.push(`${prefix}${field} = ?`);
      params.push(value);
    }
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Build search clause for multiple fields
 */
export function buildSearchClause(
  search: string | undefined,
  searchFields: string[],
  tableAlias?: string
): { clause: string; params: string[] } {
  if (!search || searchFields.length === 0) {
    return { clause: '', params: [] };
  }

  const prefix = tableAlias ? `${tableAlias}.` : '';
  const conditions = searchFields.map((field) => `${prefix}${field} LIKE ?`);
  const searchPattern = `%${search}%`;
  const params = searchFields.map(() => searchPattern);

  return {
    clause: `(${conditions.join(' OR ')})`,
    params,
  };
}

/**
 * Build ORDER BY clause
 */
export function buildOrderByClause(
  sortField: string | undefined,
  sortOrder: 'asc' | 'desc',
  allowedFields: string[],
  defaultField: string,
  tableAlias?: string
): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const field = sortField && allowedFields.includes(sortField) ? sortField : defaultField;
  return `ORDER BY ${prefix}${field} ${sortOrder.toUpperCase()}`;
}

/**
 * Build LIMIT/OFFSET clause
 */
export function buildLimitClause(page: number, pageSize: number): { clause: string; params: number[] } {
  const offset = (page - 1) * pageSize;
  return {
    clause: 'LIMIT ? OFFSET ?',
    params: [pageSize, offset],
  };
}

/**
 * Calculate total pages
 */
export function calculateTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}

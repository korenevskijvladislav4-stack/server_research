/**
 * Base service with common database operations
 */

import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import {
  PaginatedResponse,
  QueryParams,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../common/types';
import {
  buildWhereClause,
  buildSearchClause,
  buildOrderByClause,
  buildLimitClause,
  calculateTotalPages,
} from '../common/utils';

export interface ServiceConfig {
  tableName: string;
  allowedFilterFields: string[];
  searchFields: string[];
  allowedSortFields: string[];
  defaultSortField: string;
}

export class BaseService<T> {
  protected config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
  }

  /**
   * Get paginated list with filters
   */
  async findAll(params: QueryParams): Promise<PaginatedResponse<T>> {
    const page = params.page || DEFAULT_PAGE;
    const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
    const sortField = params.sortField;
    const sortOrder = params.sortOrder || 'desc';

    const connection = await pool.getConnection();
    
    try {
      // Build WHERE clause
      const whereConditions: string[] = [];
      const whereParams: any[] = [];

      // Add filters
      if (params.filters) {
        const { clause, params: filterParams } = buildWhereClause(
          params.filters,
          this.config.allowedFilterFields
        );
        if (clause) {
          whereConditions.push(clause.replace('WHERE ', ''));
          whereParams.push(...filterParams);
        }
      }

      // Add search
      if (params.search) {
        const { clause, params: searchParams } = buildSearchClause(
          params.search,
          this.config.searchFields
        );
        if (clause) {
          whereConditions.push(clause);
          whereParams.push(...searchParams);
        }
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : '';

      // Get total count
      const [countResult] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM ${this.config.tableName} ${whereClause}`,
        whereParams
      );
      const total = (countResult[0] as any).total;

      // Build ORDER BY
      const orderByClause = buildOrderByClause(
        sortField,
        sortOrder,
        this.config.allowedSortFields,
        this.config.defaultSortField
      );

      // Build LIMIT
      const { clause: limitClause, params: limitParams } = buildLimitClause(page, pageSize);

      // Get data
      const query = `
        SELECT * FROM ${this.config.tableName}
        ${whereClause}
        ${orderByClause}
        ${limitClause}
      `;
      const [rows] = await connection.query<RowDataPacket[]>(query, [...whereParams, ...limitParams]);

      return {
        data: rows as unknown as T[],
        pagination: {
          page,
          pageSize,
          total,
          totalPages: calculateTotalPages(total, pageSize),
        },
      };
    } finally {
      connection.release();
    }
  }

  /**
   * Get single item by ID
   */
  async findById(id: number | string): Promise<T | null> {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM ${this.config.tableName} WHERE id = ?`,
        [id]
      );
      
      return rows.length > 0 ? (rows[0] as unknown as T) : null;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete by ID
   */
  async delete(id: number | string): Promise<boolean> {
    const connection = await pool.getConnection();
    
    try {
      const [result] = await connection.query(
        `DELETE FROM ${this.config.tableName} WHERE id = ?`,
        [id]
      );
      
      return (result as any).affectedRows > 0;
    } finally {
      connection.release();
    }
  }
}

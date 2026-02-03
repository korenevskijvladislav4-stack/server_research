/**
 * Casino service
 */

import pool from '../database/connection';
import { BaseService, ServiceConfig } from './base.service';
import { Casino, CreateCasinoDto, UpdateCasinoDto } from '../models/Casino';
import { geoToJson, geoFromDb } from '../common/utils';

const casinoServiceConfig: ServiceConfig = {
  tableName: 'casinos',
  allowedFilterFields: ['status', 'is_our', 'geo'],
  searchFields: ['name', 'website', 'description'],
  allowedSortFields: ['id', 'name', 'created_at', 'updated_at', 'status'],
  defaultSortField: 'created_at',
};

class CasinoService extends BaseService<Casino> {
  constructor() {
    super(casinoServiceConfig);
  }

  /**
   * Transform database row to Casino object
   */
  private transformCasino(row: any): Casino {
    return {
      ...row,
      geo: geoFromDb(row.geo),
      is_our: Boolean(row.is_our),
    };
  }

  /**
   * Override findAll to transform geo field
   */
  async findAll(params: any) {
    const result = await super.findAll(params);
    return {
      ...result,
      data: result.data.map((casino) => this.transformCasino(casino)),
    };
  }

  /**
   * Override findById to transform geo field
   */
  async findById(id: number | string): Promise<Casino | null> {
    const casino = await super.findById(id);
    return casino ? this.transformCasino(casino) : null;
  }

  /**
   * Create a new casino
   */
  async create(data: CreateCasinoDto, userId?: number): Promise<Casino> {
    const connection = await pool.getConnection();
    
    try {
      const geoValue = geoToJson(data.geo);

      const [result] = await connection.query(
        `INSERT INTO casinos (name, website, description, geo, is_our, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name,
          data.website || null,
          data.description || null,
          geoValue,
          data.is_our ? 1 : 0,
          data.status || 'pending',
          userId || null,
        ]
      );

      const insertId = (result as any).insertId;
      const casino = await this.findById(insertId);
      
      if (!casino) {
        throw new Error('Failed to retrieve created casino');
      }
      
      return casino;
    } finally {
      connection.release();
    }
  }

  /**
   * Update a casino
   */
  async update(id: number | string, data: UpdateCasinoDto): Promise<Casino | null> {
    const connection = await pool.getConnection();

    try {
      const updateFields: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        updateFields.push('name = ?');
        values.push(data.name);
      }
      if (data.website !== undefined) {
        updateFields.push('website = ?');
        values.push(data.website);
      }
      if (data.description !== undefined) {
        updateFields.push('description = ?');
        values.push(data.description);
      }
      if (data.geo !== undefined) {
        updateFields.push('geo = ?');
        values.push(geoToJson(data.geo));
      }
      if (data.is_our !== undefined) {
        updateFields.push('is_our = ?');
        values.push(data.is_our ? 1 : 0);
      }
      if (data.status !== undefined) {
        updateFields.push('status = ?');
        values.push(data.status);
      }

      if (updateFields.length === 0) {
        return this.findById(id);
      }

      values.push(id);

      await connection.query(
        `UPDATE casinos SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return this.findById(id);
    } finally {
      connection.release();
    }
  }
}

export const casinoService = new CasinoService();

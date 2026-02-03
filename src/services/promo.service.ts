/**
 * Promo service
 */

import pool from '../database/connection';
import { BaseService, ServiceConfig } from './base.service';
import { PromoCampaign, CreatePromoDto, UpdatePromoDto } from '../models/PromoCampaign';

const promoServiceConfig: ServiceConfig = {
  tableName: 'promo_campaigns',
  allowedFilterFields: ['casino_id', 'geo', 'status', 'bonus_type'],
  searchFields: ['title', 'description', 'promo_code'],
  allowedSortFields: ['id', 'title', 'created_at', 'start_date', 'end_date', 'status'],
  defaultSortField: 'created_at',
};

class PromoService extends BaseService<PromoCampaign> {
  constructor() {
    super(promoServiceConfig);
  }

  /**
   * Create a new promo
   */
  async create(data: CreatePromoDto, userId?: number): Promise<PromoCampaign> {
    const connection = await pool.getConnection();

    try {
      const [result] = await connection.query(
        `INSERT INTO promo_campaigns 
         (casino_id, geo, title, description, start_date, end_date, promo_code, bonus_type, bonus_amount, wagering_requirement, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.casino_id,
          data.geo || null,
          data.title,
          data.description || null,
          data.start_date || null,
          data.end_date || null,
          data.promo_code || null,
          data.bonus_type || null,
          data.bonus_amount || null,
          data.wagering_requirement || null,
          data.status || 'upcoming',
          userId || null,
        ]
      );

      const insertId = (result as any).insertId;
      const promo = await this.findById(insertId);

      if (!promo) {
        throw new Error('Failed to retrieve created promo');
      }

      return promo;
    } finally {
      connection.release();
    }
  }

  /**
   * Update a promo
   */
  async update(id: number | string, data: UpdatePromoDto): Promise<PromoCampaign | null> {
    const connection = await pool.getConnection();

    try {
      const updateFields: string[] = [];
      const values: any[] = [];

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (updateFields.length === 0) {
        return this.findById(id);
      }

      values.push(id);

      await connection.query(
        `UPDATE promo_campaigns SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return this.findById(id);
    } finally {
      connection.release();
    }
  }
}

export const promoService = new PromoService();

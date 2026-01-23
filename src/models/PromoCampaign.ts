export interface PromoCampaign {
  id?: number;
  casino_id: number;
  geo?: string;
  title: string;
  description?: string;
  start_date?: Date;
  end_date?: Date;
  promo_code?: string;
  bonus_type?: string;
  bonus_amount?: number;
  wagering_requirement?: number;
  status: 'active' | 'expired' | 'upcoming';
  created_at?: Date;
  updated_at?: Date;
  created_by?: number;
}

export interface CreatePromoDto {
  casino_id: number;
  geo?: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  promo_code?: string;
  bonus_type?: string;
  bonus_amount?: number;
  wagering_requirement?: number;
  status?: 'active' | 'expired' | 'upcoming';
}

export interface UpdatePromoDto {
  geo?: string;
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  promo_code?: string;
  bonus_type?: string;
  bonus_amount?: number;
  wagering_requirement?: number;
  status?: 'active' | 'expired' | 'upcoming';
}

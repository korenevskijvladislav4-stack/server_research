export type PromoCategory = 'tournament' | 'promotion';
export type PromoStatus = 'active' | 'paused' | 'expired' | 'draft';

export interface CasinoPromo {
  id?: number;
  casino_id: number;
  casino_name?: string | null;
  geo: string;
  promo_category: PromoCategory;
  name: string;
  promo_type?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  provider?: string | null;
  prize_fund?: string | null;
  mechanics?: string | null;
  min_bet?: string | null;
  wagering_prize?: string | null;
  status: PromoStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  updated_by?: number | null;
}

export interface CreateCasinoPromoDto {
  geo: string;
  promo_category: PromoCategory;
  name: string;
  promo_type?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  provider?: string | null;
  prize_fund?: string | null;
  mechanics?: string | null;
  min_bet?: string | null;
  wagering_prize?: string | null;
  status?: PromoStatus;
}

export interface UpdateCasinoPromoDto extends Partial<CreateCasinoPromoDto> {}

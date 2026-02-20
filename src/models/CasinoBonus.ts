export type CasinoBonusStatus = 'active' | 'paused' | 'expired' | 'draft';

// Вид бонуса
export type BonusKind = 'deposit' | 'nodeposit' | 'cashback' | 'rakeback';

// Тип бонуса  
export type BonusType = 'cash' | 'freespin' | 'combo';

export type BonusCategory = 'casino' | 'sport';

export interface CasinoBonus {
  id?: number;
  casino_id: number;
  geo: string; // e.g. "RU", "DE", "BR"
  name: string; // display name of the bonus
  bonus_category?: BonusCategory; // casino or sport
  
  // Вид и тип бонуса
  bonus_kind?: BonusKind; // deposit, nodeposit, cashback, rakeback (для casino) или welcome, reload, freebet (для sport)
  bonus_type?: BonusType; // cash, freespin, combo (для casino) или freebet, accumulator, odds_boost (для sport)
  
  // Для кэш-бонусов
  bonus_value?: number; // numeric value (amount or percent)
  bonus_unit?: 'percent' | 'amount';
  currency?: string; // e.g. EUR, USD
  
  // Для фриспин-бонусов
  freespins_count?: number; // количество фриспинов
  freespin_value?: number; // стоимость одного спина
  freespin_game?: string; // игра для фриспинов
  
  // Для кешбека/рейкбека
  cashback_percent?: number; // процент возврата
  cashback_period?: string; // период (daily, weekly, monthly)
  
  // Общие поля
  min_deposit?: number;
  max_bonus?: number;
  max_cashout?: number; // устаревшее, для обратной совместимости; для кэш — см. max_win_cash_*
  /** Максвин по кэш-бонусу: значение (фикс. сумма или коэффициент) */
  max_win_cash_value?: number | null;
  /** Максвин по кэш-бонусу: тип — фиксированная сумма или коэффициент */
  max_win_cash_unit?: 'fixed' | 'coefficient' | null;
  /** Максвин для фриспинов: значение (фикс. сумма или коэффициент) */
  max_win_freespin_value?: number | null;
  /** Максвин для фриспинов: тип — фиксированная сумма или коэффициент */
  max_win_freespin_unit?: 'fixed' | 'coefficient' | null;
  /** Максвин для процентной части (в комбо): значение */
  max_win_percent_value?: number | null;
  /** Максвин для процентной части: тип — фикс. сумма или коэффициент */
  max_win_percent_unit?: 'fixed' | 'coefficient' | null;
  wagering_requirement?: number; // вейджер на кэш-часть (x)
  wagering_freespin?: number | null; // вейджер на фриспиновую часть (x)
  wagering_games?: string; // free-text, e.g. "slots only"
  wagering_time_limit?: string | null; // время на отыгрыш, e.g. "7 дней", "30 дней"
  promo_code?: string;
  valid_from?: string; // ISO date
  valid_to?: string; // ISO date
  status: CasinoBonusStatus;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
}

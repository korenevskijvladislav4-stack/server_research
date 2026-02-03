/** Направление платёжного решения: Депозит или Выплата */
export type PaymentDirection = 'deposit' | 'withdrawal';

export interface CasinoPayment {
  id?: number;
  casino_id: number;
  geo: string;
  direction: PaymentDirection; // Депозит / Выплата
  type: string; // тип: перевод, мобильная коммерция и т.д.
  method: string; // метод: СБП, T-Банк и т.д.
  min_amount?: number | null;
  max_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  created_at?: Date;
  updated_at?: Date;
  created_by?: number | null;
  updated_by?: number | null;
}

export interface CreateCasinoPaymentDto {
  geo: string;
  direction: PaymentDirection;
  type: string;
  method: string;
  min_amount?: number | null;
  max_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface UpdateCasinoPaymentDto {
  geo?: string;
  direction?: PaymentDirection;
  type?: string;
  method?: string;
  min_amount?: number | null;
  max_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
}


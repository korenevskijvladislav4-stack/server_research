export interface CasinoPayment {
  id?: number;
  casino_id: number;
  geo: string;
  type: string; // тип: перевод, мобильная коммерция и т.д.
  method: string; // метод: СБП, T-Банк и т.д.
  min_amount?: number | null; // минимальная сумма
  max_amount?: number | null; // максимальная сумма
  currency?: string | null; // валюта
  notes?: string | null;
  created_at?: Date;
  updated_at?: Date;
  created_by?: number | null;
  updated_by?: number | null;
}

export interface CreateCasinoPaymentDto {
  geo: string;
  type: string;
  method: string;
  min_amount?: number | null;
  max_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface UpdateCasinoPaymentDto {
  geo?: string;
  type?: string;
  method?: string;
  min_amount?: number | null;
  max_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
}


export type AccountTransactionType = 'deposit' | 'withdrawal';

export interface AccountTransaction {
  id: number;
  account_id: number;
  type: AccountTransactionType;
  amount: number;
  currency?: string | null;
  transaction_date: string; // YYYY-MM-DD
  notes?: string | null;
  created_at: string;
  created_by?: number | null;
  // joined
  casino_name?: string | null;
  casino_id?: number;
  geo?: string | null;
  email?: string | null;
}

export interface CreateAccountTransactionDto {
  type: AccountTransactionType;
  amount: number;
  currency?: string | null;
  transaction_date?: string;
  notes?: string | null;
}

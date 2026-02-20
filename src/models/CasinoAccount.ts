export interface CasinoAccount {
  id: number;
  casino_id: number;
  casino_name?: string | null;
  geo: string;
  email?: string | null;
  phone?: string | null;
  password: string;
  owner_id?: number | null;
  owner_username?: string | null;
  last_modified_at: string;
  created_at: string;
  updated_at: string;
  deposit_count?: number;
  withdrawal_count?: number;
}

export interface CreateCasinoAccountDto {
  casino_id: number;
  geo: string;
  email?: string | null;
  phone?: string | null;
  password: string;
  owner_id?: number | null;
}

export interface UpdateCasinoAccountDto {
  geo?: string;
  email?: string | null;
  phone?: string | null;
  password?: string;
  owner_id?: number | null;
}

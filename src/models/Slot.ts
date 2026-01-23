export interface Slot {
  id?: number;
  casino_id: number;
  geo: string; // GEO код (RU, DE, BR и т.д.)
  name: string;
  provider?: string | null;
  image_url?: string | null;
  description?: string | null;
  rtp?: number | null;
  volatility?: string | null;
  min_bet?: number | null;
  max_bet?: number | null;
  max_win?: number | null;
  features?: string[] | null;
  tags?: string[] | null;
  is_featured?: boolean;
  is_new?: boolean;
  is_popular?: boolean;
  parsed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateSlotDto {
  casino_id: number;
  geo: string;
  name: string;
  provider?: string | null;
  image_url?: string | null;
  description?: string | null;
  rtp?: number | null;
  volatility?: string | null;
  min_bet?: number | null;
  max_bet?: number | null;
  max_win?: number | null;
  features?: string[] | null;
  tags?: string[] | null;
  is_featured?: boolean;
  is_new?: boolean;
  is_popular?: boolean;
}

export interface UpdateSlotDto {
  name?: string;
  provider?: string | null;
  image_url?: string | null;
  description?: string | null;
  rtp?: number | null;
  volatility?: string | null;
  min_bet?: number | null;
  max_bet?: number | null;
  max_win?: number | null;
  features?: string[] | null;
  tags?: string[] | null;
  is_featured?: boolean;
  is_new?: boolean;
  is_popular?: boolean;
}

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks4' | 'socks5';
}

export interface GeoProxyMapping {
  [geo: string]: ProxyConfig[];
}

export interface SlotSelector {
  id?: number;
  casino_id: number;
  geo: string;
  section: string;
  category?: string | null;
  selector: string;
  url?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateSlotSelectorDto {
  casino_id: number;
  geo: string;
  section: string;
  category?: string | null;
  selector: string;
  url?: string | null;
}

export interface UpdateSlotSelectorDto {
  geo?: string;
  section?: string;
  category?: string | null;
  selector?: string;
  url?: string | null;
}

export interface SlotScreenshot {
  id?: number;
  selector_id: number;
  screenshot_path: string;
  screenshot_url?: string;
  created_at?: Date;
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

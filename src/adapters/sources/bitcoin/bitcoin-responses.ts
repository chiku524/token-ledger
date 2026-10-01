/** Shapes of the Esplora HTTP responses the reader consumes. */

export interface EsploraAddressStats {
  funded_txo_count: number;
  funded_txo_sum: number;
  spent_txo_count: number;
  spent_txo_sum: number;
  tx_count: number;
}

export interface EsploraAddress {
  address: string;
  chain_stats: EsploraAddressStats;
  mempool_stats: EsploraAddressStats;
}

export interface EsploraVout {
  scriptpubkey: string;
  scriptpubkey_address?: string;
  value: number;
}

export interface EsploraVin {
  txid: string;
  vout: number;
  prevout: EsploraVout | null;
}

export interface EsploraStatus {
  confirmed: boolean;
  block_height?: number;
  block_time?: number;
}

export interface EsploraTx {
  txid: string;
  vin: EsploraVin[];
  vout: EsploraVout[];
  status: EsploraStatus;
  fee: number;
}

import * as mongoose from 'mongoose';

export interface Coins extends mongoose.Document {
  chainId: string;
  name: string;
  address: string;
  decimals: string;
  symbol: string;
  logoURI: string;
}
export const CoinSchema = new mongoose.Schema({
  chainId: { type: String },
  name: { type: String },
  address: { type: String, unique: true },
  decimals: { type: String },
  symbol: { type: String },
  logoURI: { type: String },
});

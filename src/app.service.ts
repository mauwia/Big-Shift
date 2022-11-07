import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Coins } from './app.model';
let axios = require('axios');

@Injectable()
export class AppService {
  constructor(
    @InjectModel('Coins') private readonly coinsModel: Model<Coins>,
  ) {}
  async getHello() {
    let result = await axios({
      url: 'https://api.coinmarketcap.com/data-api/v3/uniswap/all.json',
      method: 'get',
    });
    let coinGeckoList = await axios({
      url: 'https://tokens.coingecko.com/uniswap/all.json',
      method: 'get',
    });
    await this.coinsModel.deleteMany({});
    let resultCombine = [...result.data.tokens, ...coinGeckoList.data.tokens];

    const arrayUniqueByKey = [
      ...new Map(resultCombine.map((item) => [item['address'], item])).values(),
    ];
    let coins = await this.coinsModel.insertMany(arrayUniqueByKey);
    // return result.data.tokens
  }
  async getListTokens(req) {
    var perPage = 10,
      page = Math.max(0, req.params.page);

    let tokens = await this.coinsModel
      .find()
      .limit(perPage)
      .skip(perPage * page);
    return { tokens };
  }
  async getListTokensBees(req) {

    let tokens = await this.coinsModel
      .find({isBees:true})
    return { tokens };
  }
  async getToken(req){
    let tokens = await this.coinsModel
    .find({symbol:req.params.symbol})
  return { tokens };
  }
  async addToken(req) {
    let newToken=new this.coinsModel(req.body)
    let token=await this.coinsModel.create(newToken)
    return "Done"
  }
}

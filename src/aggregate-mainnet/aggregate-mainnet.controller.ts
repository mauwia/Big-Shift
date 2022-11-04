import { Controller, Get, Post, Req } from '@nestjs/common';
import { AggregateMainnetService } from './aggregate-mainnet.service';
import { request, Request } from 'express';
import { SOR, SwapInfo, SwapTypes } from '@balancer-labs/sor';
import { JsonRpcProvider } from '@ethersproject/providers';

@Controller('aggregate-mainnet')
export class AggregateMainnetController {
  constructor(private readonly aggregateService: AggregateMainnetService) {}
  @Post('/')
  async getAggregateRoute(@Req() request: Request) {
    let response = await this.aggregateService.getAggregateRoutes(
      request.body.tokenInContractAddress.toLocaleLowerCase(),
      request.body.tokenOutContractAddress.toLocaleLowerCase(),
      request.body.amount,
      request.body.tokenInSymbol,
      request.body.tokenOutSymbol,
      request.body.decimalIn,
      request.body.decimalOut,
    );
    // let response=await this.aggregateService.getWethPairs("0x47bd5114c12421fbc8b15711ce834afdedea05d9")
    return response;
  }

  @Get('/test1')
  async test1(@Req() request: Request) {
    console.log('CHECK');
  
    let response = await this.aggregateService.checkRoutesLiquidity(
      request.body.routes,
      request.body.amountIn,
    );
    // let response=await this.aggregateService.getWethPairs("0x47bd5114c12421fbc8b15711ce834afdedea05d9")
    return response;
  }
}

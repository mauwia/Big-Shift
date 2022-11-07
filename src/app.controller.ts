import { Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async getHello() {

  }
  @Get("getTokensList/:page")
  async tokensList(@Req() request:Request) {
    let response=await  this.appService.getListTokens(request);
    // console.log(response)
    return response
  }
  @Get("getTokensListBees")
  async tokensListBees(@Req() request:Request) {
    let response=await  this.appService.getListTokensBees(request);
    // console.log(response)
    return response
  }
  @Post("addToken")
  async addToken(@Req() request:Request) {
    let response=await  this.appService.addToken(request);
    // console.log(response)
    return response
  }
  @Get("getToken/:symbol")
  async getToken(@Req() request:Request){
    let response=await this.appService.getToken(request)
    return response
  }
}

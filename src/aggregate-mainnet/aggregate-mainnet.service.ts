import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { response } from 'express';
import {
  BigNumber,
  BigNumberish,
  formatFixed,
  parseFixed,
} from '@ethersproject/bignumber';
import { JsonRpcProvider } from '@ethersproject/providers';

import { SOR, SwapInfo, SwapTypes } from '@balancer-labs/sor';
import { Model } from 'mongoose';
import { Coins } from '../app.model';
import {
  ERC_20_CONTRACT_ADDRESS,
  blackListPairs,
  blackListTokens,
  TOP_10_COINS,
} from './constant/constant';
import { DATABASE_ABI } from './constant/swapABI';
import { InjectModel } from '@nestjs/mongoose';
import { log } from 'console';
import { async } from 'rxjs';

let singleSwapTemplate = {
  poolId: null,
  kind: 0,
  tokenIn: null,
  tokenOut: null,
  amount: null,
  userData: null,
};
let WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
let axios = require('axios');
let web3 = require('web3');

@Injectable()
export class AggregateMainnetService {
  constructor(
    @InjectModel('Coins') private readonly coinsModel: Model<Coins>,
  ) {}

  CompleteRoutes = [];
  tokenList = [];

  async getTokens(tokenPath: []) {
    let searchToken = await this.coinsModel
      .find({
        address: {
          $in: tokenPath,
        },
      })
      .select('logoURI address name');
    console.log(Object.values(searchToken));

    let filtered = Object.values(searchToken).map((ele) => ele.logoURI);

    let result = tokenPath.map(
      (path) => searchToken.find((token) => path === token.address)?.logoURI,
    );

    let namesResult = tokenPath.map(
      (path) => searchToken.find((token) => path === token.address)?.name,
    );

    console.log('Filtered =? ', filtered);
    console.log('result => ', result);

    console.log('namesResult => ', namesResult);

    return { logosArray: result, tokensName: namesResult };
  }
  setCount = (tokenIn, tokenOut) => {
    let isTokenInTop10 = TOP_10_COINS.filter((coin) => coin.id == tokenIn);
    let isTokenOutTop10 = TOP_10_COINS.filter((coin) => coin.id == tokenOut);
    if (isTokenOutTop10.length && isTokenInTop10.length) return 50;
    else if (!isTokenOutTop10.length && isTokenInTop10.length) return 600;
    else if (isTokenOutTop10.length && !isTokenInTop10.length) return 50;
    else if (!isTokenOutTop10.length && !isTokenInTop10.length) return 50;
  };
  getResult = async (token, tokenOut) => {
    // console.log(token)
    try {
      let count = this.setCount(token, tokenOut);
      let [result0, result1] = await Promise.all([
        axios({
          url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
          method: 'post',
          data: {
            query:
              `
          {
            pairs(first:${count},where:{token0:"` +
              token +
              `"  },orderBy:txCount,orderDirection:desc  ) {
              id
              token0 {
                id
                decimals
                symbol
              }
              token1 {
                id
                decimals
                symbol
              }
                  reserve0
                  reserve1
                  totalSupply
            }
          }
            
          `,
          },
        }),
        axios({
          url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
          method: 'post',
          data: {
            query:
              `
          {
            pairs(first:${count},where:{token1:"` +
              token +
              `"},orderBy:txCount,orderDirection:desc ) {
              id
              token0 {
                id
                decimals
                symbol
              }
              token1 {
                id
                decimals
                symbol
              }
                  reserve0
                  reserve1
                  totalSupply
            }
          }
            
          `,
          },
        }),
      ]);

      // console.log(result0.data.data?.pairs.length,token,'0')
      // console.log(result1.data.data?.pairs.length,token,'1')
      let pairs = result0.data.data.pairs;
      let tokens = [];
      for (let k = 0; k < pairs.length; k++) {
        if (!blackListPairs.filter((pair) => pair == pairs[k].id).length)
          tokens.push({
            id: pairs[k].id,
            tokenAddress: pairs[k].token1.id,
            tokenSymbol: pairs[k].token1.symbol,
            reserveIn: pairs[k].reserve0,
            reserveOut: pairs[k].reserve1,
            decimalIn: pairs[k].token1.decimals,
            priority: 1,
          });
      }

      pairs = result1.data.data.pairs;
      // console.log(result.data.data.pairs)
      for (let l = 0; l < pairs.length; l++) {
        if (!blackListPairs.filter((pair) => pair == pairs[l].id).length)
          tokens.push({
            id: pairs[l].id,
            tokenAddress: pairs[l].token0.id,
            tokenSymbol: pairs[l].token0.symbol,
            reserveIn: pairs[l].reserve1,
            reserveOut: pairs[l].reserve0,
            decimalIn: pairs[l].token0.decimals,
            priority: 1,
          });
      }

      tokens.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      return tokens;
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          msg: error,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  };
  getBestRoute = async (
    tokenIn,
    tokenOut,
    tokenInAmount,
    routeCounter,
    route,
    tokenPath,
    outputArray = [],
    decimalsArray = [],
    completeRoutes,
    tokenList,
    poolId,
  ) => {
    // console.log("START",tokenIn)
    if (routeCounter == 0) {
      tokenList.push(tokenIn);
    }
    let tokensRoute = await this.getResult(tokenIn, tokenOut);

    if (
      !blackListTokens.filter((blackListToken) => blackListToken == tokenOut)
        .length
    )
      tokensRoute = tokensRoute.filter(
        (el) => -1 == blackListTokens.indexOf(el.tokenAddress),
      );
    await Promise.all(
      tokensRoute.map((tokenRoute) =>
        this.getSingleBestRoute(
          [tokenRoute],
          tokenOut,
          tokenInAmount,
          route,
          tokenPath,
          routeCounter,
          outputArray,
          decimalsArray,
          completeRoutes,
          tokenList,
          poolId,
        ),
      ),
    );
  };
  getSingleBestRoute = async (
    tokensRoute,
    tokenOut,
    tokenInAmount,
    route,
    tokenPath,
    routeCounter,
    outputArray,
    decimalsArray,
    completeRoutes,
    tokenList,
    poolId,
  ) => {
    for (let i = 0; i < tokensRoute.length; i++) {
      let amountOut =
        (tokenInAmount * Number(tokensRoute[i].reserveOut)) /
        Number(tokensRoute[i].reserveIn);

      if (amountOut < Number(tokensRoute[i].reserveOut) && routeCounter <= 2) {
        if (tokensRoute[i].tokenAddress == tokenOut) {
          console.log('AMOUNT', amountOut, Number(tokensRoute[i].reserveOut));
          let temp = JSON.parse(JSON.stringify(tokenPath));
          temp.push(tokenOut);
          let tempOutput = JSON.parse(JSON.stringify(outputArray));
          tempOutput.push(amountOut);
          let tempDecimal = JSON.parse(JSON.stringify(decimalsArray));
          tempDecimal.push(tokensRoute[i].decimalIn);
          let tempPoolId = JSON.parse(JSON.stringify(poolId));
          tempPoolId.push(tokensRoute[i].id);
          completeRoutes.push({
            exchangeType: 'Uniswap V2',
            route: route + '>' + tokensRoute[i].tokenSymbol,
            output: amountOut,
            tokenPath: temp,
            outputArray: tempOutput,
            updatedOutput: amountOut,
            outputDecimal: tempDecimal,
            dex: tempOutput[temp.indexOf(WETH_ADDRESS)],
            outputAmountForOne: tempOutput,

            poolId: tempPoolId,
            tokenExchange: temp.map((token) => 0).slice(0, -1),
            option: temp
              .map((token, index) => {
                if (
                  temp[index] != WETH_ADDRESS &&
                  temp[index + 1] == WETH_ADDRESS
                ) {
                  return 1;
                } else if (
                  temp[index] == WETH_ADDRESS &&
                  temp[index + 1] != WETH_ADDRESS
                ) {
                  return 2;
                } else if (
                  temp[index] != WETH_ADDRESS &&
                  temp[index + 1] != WETH_ADDRESS
                ) {
                  return 0;
                }
              })
              .slice(0, -1),
          });
        } else {
          // console.log(i)

          if (
            tokensRoute[i] &&
            !this.checkInList(tokensRoute[i].tokenAddress, tokenOut, tokenList)
          ) {
            tokenList.push(tokensRoute[i].tokenAddress);
            let amountOut =
              (tokenInAmount * Number(tokensRoute[i].reserveOut)) /
              Number(tokensRoute[i].reserveIn);
            let tempOutput = JSON.parse(JSON.stringify(outputArray));
            let temp = JSON.parse(JSON.stringify(tokenPath));
            tempOutput.push(amountOut);
            temp.push(tokensRoute[i].tokenAddress);
            let tempDecimal = JSON.parse(JSON.stringify(decimalsArray));
            tempDecimal.push(tokensRoute[i].decimalIn);
            let tempPoolId = JSON.parse(JSON.stringify(poolId));
            tempPoolId.push(tokensRoute[i].id);
            let tempi = i;
            await this.getBestRoute(
              tokensRoute[i].tokenAddress,
              tokenOut,
              amountOut,
              routeCounter + 1,
              route + '>' + tokensRoute[i].tokenSymbol,
              temp,
              tempOutput,
              tempDecimal,
              completeRoutes,
              tokenList,
              tempPoolId,
            );
            i = tempi;
          } else {
          }
        }
      } else {
      }
    }
  };

  checkInList = (token, tokenOut, tokenList) => {
    if (token != tokenOut) {
      for (let j = 0; j < tokenList.length; j++) {
        if (token == tokenList[j]) {
          return true;
        }
      }
    }
    return false;
  };

  getAggregateFromBalancer = async (
    tokenIn,
    tokenOut,
    decimalIn,
    amount,
    sor,
    outputAmountForOne,
  ) => {
    if (!tokenOut.address) return;
    try {
      const swapType = SwapTypes.SwapExactIn;
      const swapAmount = parseFixed(`${amount.toPrecision(7)}`, decimalIn); // In normalized format, i.e. 1USDC = 1
      const swapAmount1 = parseFixed(
        `${outputAmountForOne.toPrecision(7)}`,
        decimalIn,
      );
      const maxPools = 4;
      const [swapInfo, swapInfo1] = await Promise.all([
        sor.getSwaps(tokenIn.address, tokenOut.address, swapType, swapAmount, {
          maxPools,
        }),
        sor.getSwaps(tokenIn.address, tokenOut.address, swapType, swapAmount1, {
          maxPools,
        }),
      ]);
      const amtInScaled =
        swapType === SwapTypes.SwapExactIn
          ? formatFixed(swapAmount, tokenIn.decimals)
          : formatFixed(swapInfo.returnAmount, tokenIn.decimals);
      const amtOutScaled =
        swapType === SwapTypes.SwapExactIn
          ? formatFixed(swapInfo.returnAmount, tokenOut.decimals)
          : formatFixed(swapAmount, tokenOut.decimals);
      const amtOutScaled1 =
        swapType === SwapTypes.SwapExactIn
          ? formatFixed(swapInfo1.returnAmount, tokenOut.decimals)
          : formatFixed(swapAmount1, tokenOut.decimals);
      const returnDecimals =
        swapType === SwapTypes.SwapExactIn
          ? tokenOut.decimals
          : tokenIn.decimals;
      const returnWithFees = formatFixed(
        swapInfo.returnAmountConsideringFees,
        returnDecimals,
      );

      // const costToSwapScaled = formatFixed(cost, returnDecimals);

      const swapTypeStr =
        swapType === SwapTypes.SwapExactIn ? 'SwapExactIn' : 'SwapExactOut';
      // console.log(swapTypeStr);
      console.log(
        `Token In: ${tokenIn.symbol}, Amt: ${amtInScaled.toString()}`,
      );
      console.log(
        `Token Out: ${tokenOut.symbol}, Amt: ${amtOutScaled.toString()}`,
      );
      // console.log(`Cost to swap: ${costToSwapScaled.toString()}`);
      console.log(`Return Considering Fees: ${returnWithFees.toString()}`);
      console.log(`Swaps:`);
      // console.log(swapInfo);
      console.log(swapInfo.tokenAddresses);
      let web3Inst = new web3(
        'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      );
      let aggregatorContract = new web3Inst.eth.Contract(
        DATABASE_ABI.abi,
        ERC_20_CONTRACT_ADDRESS,
      );
      const route = await Promise.all(
        swapInfo.tokenAddresses.map((tokenAddress) =>
          aggregatorContract.methods.getDetails(tokenAddress).call(),
        ),
      );
      const limits: string[] = [];
      swapInfo.tokenAddresses.forEach((token, i) => {
        if (token.toLowerCase() === swapInfo.tokenIn.toLowerCase()) {
          limits[i] = swapInfo.swapAmount.toString();
        } else if (token.toLowerCase() === swapInfo.tokenOut.toLowerCase()) {
          limits[i] = swapInfo.returnAmount.mul(-99).div(100).toString();
        } else {
          limits[i] = '0';
        }
      });

      if (parseFloat(amtOutScaled))
        return {
          // limits,
          exchangeName: 'Balancer',
          swapInfo: {
            ...swapInfo,
            // costToSwapScaled: costToSwapScaled.toString(),
            returnWithFees: returnWithFees.toString(),
          },
          route: route.map((e) => e[1]).join('>'),
          tokenPath: swapInfo.tokenAddresses,
          output: amtOutScaled.toString(),
          outputAmountForOne: amtOutScaled1.toString(),
        };
      else {
        return {
          // limits,
          exchangeName: 'Balancer',
          swapInfo: {},
          route: route.map((e) => e[1]).join('>'),
          tokenPath: [],
          output: 0,
          outputAmountForOne: 0,
        };
      }
    } catch (error) {
      return error;
    }
  };
  getDirectRouteBalancer = async (
    tokenIn,
    tokenOut,
    decimalIn,
    amount,
    sor,
  ) => {
    const networkId = 1;
    // const networkId = Network.KOVAN;
    // Pools source can be Subgraph URL or pools data set passed directly
    const poolsSource =
      'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2';
    const provider = new JsonRpcProvider(
      'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    );
    sor = new SOR(provider, networkId, poolsSource);
    await sor.fetchPools([], false);
    if (!tokenOut.address) return;
    try {
      const swapType = SwapTypes.SwapExactIn;
      const swapAmount = parseFixed(`${amount}`, decimalIn); // In normalized format, i.e. 1USDC = 1
      const swapAmount1 = parseFixed(`1`, decimalIn);
      const maxPools = 4;
      const [swapInfo, swapInfo1] = await Promise.all([
        sor.getSwaps(tokenIn.address, tokenOut.address, swapType, swapAmount, {
          maxPools,
        }),
        sor.getSwaps(tokenIn.address, tokenOut.address, swapType, swapAmount1, {
          maxPools,
        }),
      ]);
      const amtInScaled =
        swapType === SwapTypes.SwapExactIn
          ? formatFixed(swapAmount, tokenIn.decimals)
          : formatFixed(swapInfo.returnAmount, tokenIn.decimals);
      const amtOutScaled =
        swapType === SwapTypes.SwapExactIn
          ? formatFixed(swapInfo.returnAmount, tokenOut.decimals)
          : formatFixed(swapAmount, tokenOut.decimals);
      const amtOutScaled1 =
        swapType === SwapTypes.SwapExactIn
          ? formatFixed(swapInfo1.returnAmount, tokenOut.decimals)
          : formatFixed(swapAmount1, tokenOut.decimals);
      const returnDecimals =
        swapType === SwapTypes.SwapExactIn
          ? tokenOut.decimals
          : tokenIn.decimals;
      const returnWithFees = formatFixed(
        swapInfo.returnAmountConsideringFees,
        returnDecimals,
      );

      // const costToSwapScaled = formatFixed(cost, returnDecimals);

      const swapTypeStr =
        swapType === SwapTypes.SwapExactIn ? 'SwapExactIn' : 'SwapExactOut';
      // console.log(swapTypeStr);
      console.log(
        `Token In: ${tokenIn.symbol}, Amt: ${amtInScaled.toString()}`,
      );
      console.log(
        `Token Out: ${tokenOut.symbol}, Amt: ${amtOutScaled.toString()}`,
      );
      // console.log(`Cost to swap: ${costToSwapScaled.toString()}`);
      console.log(`Return Considering Fees: ${returnWithFees.toString()}`);
      console.log(`Swaps:`);
      console.log(swapInfo);
      console.log(swapInfo.tokenAddresses);
      let web3Inst = new web3(
        'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      );
      let aggregatorContract = new web3Inst.eth.Contract(
        DATABASE_ABI.abi,
        ERC_20_CONTRACT_ADDRESS,
      );
      const route = await Promise.all(
        swapInfo.tokenAddresses.map((tokenAddress) =>
          aggregatorContract.methods.getDetails(tokenAddress).call(),
        ),
      );
      const limits: string[] = [];
      // swapInfo.tokenAddresses.forEach((token, i) => {
      //   if (token.toLowerCase() === swapInfo.tokenIn.toLowerCase()) {
      //     limits[i] = swapInfo.swapAmount.toString();
      //   } else if (token.toLowerCase() === swapInfo.tokenOut.toLowerCase()) {
      //     limits[i] = swapInfo.returnAmount.mul(-99).div(100).toString();
      //   } else {
      //     limits[i] = '0';
      //   }
      // });

      if (parseFloat(amtOutScaled))
        if (swapInfo.tokenAddress == '2') {
          return {
            exchangeType: 'Merged Route',
            tokenExchange: [1],
            limit: swapInfo.swapAmount.toString(),
            outputs: [amount, parseFloat(amtOutScaled)],
            output: parseFloat(amtOutScaled),
            tokenPath: swapInfo.tokenAddresses,
            route: route.map((e) => e[1]).join('>'),
            updatedOutput: parseFloat(amtOutScaled1),
          };
        } else {
          return {
            // limits,
            exchangeName: 'Balancer',
            swapInfo: {},
            route: route.map((e) => e[1]).join('>'),
            tokenPath: [],
            output: 0,
          };
        }
    } catch (error) {
      return error;
    }
  };
  optimizeUniswapV2 = async (uniSwapRoute, sor, completeRoutes) => {
    // Update pools list with most recent onchain balances
    let balancerRoute: any = await Promise.all(
      uniSwapRoute.tokenPath.map((path, index) =>
        this.getAggregateFromBalancer(
          {
            address: uniSwapRoute.tokenPath[index],
            decimals: uniSwapRoute.outputDecimal[index],
            symbol: uniSwapRoute.route.split('>')[index],
          },
          {
            address: uniSwapRoute.tokenPath[index + 1],
            decimals: uniSwapRoute.outputDecimal[index + 1],
            symbol: uniSwapRoute.route.split('>')[index + 1],
          },
          uniSwapRoute.outputDecimal[index],
          uniSwapRoute.outputArray[index],
          sor,
          uniSwapRoute.outputAmountForOne[index],
        ),
      ),
    );
    this.routeOptimizer(uniSwapRoute, balancerRoute, completeRoutes);
  };
  getAggregateRoutes = async (
    tokenIn,
    tokenOut,
    amountIn,
    tokenInSymbol,
    tokenOutSymbol,
    decimalIn,
    decimalOut,
  ) => {
    let tokenList = [];

    let completeRoutes = [];
    let poolId = [];

    let tokenPath = [tokenIn];
    const networkId = 1;
    // const networkId = Network.KOVAN;
    // Pools source can be Subgraph URL or pools data set passed directly
    const poolsSource =
      'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2';
    const provider = new JsonRpcProvider(
      'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    );
    const sor = new SOR(provider, networkId, poolsSource);

    // Will get onChain data for pools list
    await Promise.all([
      this.getBestRoute(
        tokenIn,
        tokenOut,
        amountIn,
        0,
        tokenInSymbol,
        tokenPath,
        [amountIn],
        [`${decimalIn}`],
        completeRoutes,
        tokenList,
        poolId,
      ),
      sor.fetchPools([], false),
    ]);
    await Promise.all(
      completeRoutes.map((completeRoute) =>
        this.optimizeUniswapV2(completeRoute, sor, completeRoutes),
      ),
    );
    let icon = await Promise.all(
      completeRoutes.map((route) => this.getTokens(route.tokenPath)),
    );

    completeRoutes = completeRoutes.map((route, index) => {
      return { ...route, ...icon[index] };
    });
    if (completeRoutes.length) return completeRoutes;
    else return { error: true, msg: 'Not Enough Liquidity' };
    // console.log(this.CompleteRoutes);
  };
  routeOptimizer = (uniSwapRoute, balancerRoute, completeRoutes) => {
    let route = '';
    let tokens = uniSwapRoute.route.split('>');
    let tokenIn = tokens[0];
    let tokenOut = tokens[tokens.length - 1];
    let output, limit, updatedOutput;
    let outputs = [uniSwapRoute.outputArray[0]];

    let uniswapOutputs = [];
    let tokenPath = [];
    let balancerPools = [];
    let tokenExchange = [];
    for (let i = 0; i < balancerRoute.length - 1; i++) {
      if (
        parseFloat(balancerRoute[i]?.output) >
          uniSwapRoute?.outputArray[i + 1] &&
        !route &&
        tokenIn == balancerRoute[i].route.split('>')[0]
      ) {
        route += balancerRoute[i]?.route;
        tokenPath.push(...balancerRoute[i]?.tokenPath);
        tokenExchange.push(
          balancerRoute[i].swapInfo.tokenAddresses.length <= 2 ? 1 : 2,
        );
        balancerPools.push(
          balancerRoute[i]?.swapInfo.swaps.map((swap, index) => {
            return {
              ...swap,
              tokenIn: balancerRoute[i]?.tokenPath[index],
              tokenOut: balancerRoute[i]?.tokenPath[index + 1],
              kind: 0,
            };
          }),
        );
        if (balancerRoute[i].swapInfo?.tokenAddresses?.length > 2)
          outputs.push(null);
        else if (balancerRoute[i].swapInfo?.tokenAddresses?.length == 2) {
          limit = balancerRoute[i]?.output;
        }
        updatedOutput = balancerRoute[i]?.outputAmountForOne;
        output = balancerRoute[i]?.output;
      } else if (
        parseFloat(balancerRoute[i]?.output) <
          uniSwapRoute?.outputArray[i + 1] &&
        !route &&
        tokenIn == uniSwapRoute.route.split('>')[0]
      ) {
        route +=
          uniSwapRoute.route.split('>')[i] +
          '>' +
          uniSwapRoute.route.split('>')[i + 1];
        tokenPath.push(
          uniSwapRoute.tokenPath[i],
          uniSwapRoute.tokenPath[i + 1],
        );
        tokenExchange.push(0);
        balancerPools.push(0);
        uniswapOutputs.push(
          uniSwapRoute?.outputArray[i],
          uniSwapRoute?.outputArray[i + 1],
        );
        updatedOutput = uniSwapRoute.updatedOutput;
        output = uniSwapRoute?.outputArray[i + 1];
      } else if (
        parseFloat(balancerRoute[i]?.output) <
          uniSwapRoute?.outputArray[i + 1] &&
        route
      ) {
        route += '>' + uniSwapRoute.route.split('>')[i + 1];
        tokenPath.push(uniSwapRoute.tokenPath[i + 1]);
        tokenExchange.push(0);
        balancerPools.push(0);
        uniswapOutputs.push(
          outputs[outputs.length - 1],
          uniSwapRoute?.outputArray[i + 1],
        );
        output = uniSwapRoute?.outputArray[i + 1];
        updatedOutput = uniSwapRoute.updatedOutput;
      } else if (
        parseFloat(balancerRoute[i]?.output) >
          uniSwapRoute?.outputArray[i + 1] &&
        route
      ) {
        route += '>' + balancerRoute[i]?.route.split('>').slice(1).join('>');
        tokenPath.push(...balancerRoute[i]?.tokenPath);
        updatedOutput = balancerRoute[i]?.outputAmountForOne;

        output = balancerRoute[i]?.output;
        if (balancerPools[balancerPools.length - 1]) {
          tokenExchange[tokenExchange.length - 1] = 2;
          balancerRoute[i].swapInfo.swaps.map((swap, index) => {
            balancerPools[balancerPools.length - 1].push({
              poolId: swap.poolId,
              assetInIndex:
                balancerPools[balancerPools.length - 1][
                  balancerPools[balancerPools.length - 1].length - 1
                ].assetInIndex + 1,
              assetOutIndex:
                balancerPools[balancerPools.length - 1][
                  balancerPools[balancerPools.length - 1].length - 1
                ].assetOutIndex + 1,
              tokenIn: balancerRoute[i]?.tokenPath[index],
              tokenOut: balancerRoute[i]?.tokenPath[index + 1],
              amount: '0',
              userData: '0x',
            });
          });
        } else {
          tokenExchange.push(
            balancerRoute[i].swapInfo.tokenAddresses.length <= 2 ||
              !!tokenExchange.find((element) => element == 1)
              ? 1
              : 2,
          );
          balancerPools.push(
            balancerRoute[i]?.swapInfo.swaps.map((swap, index) => {
              return {
                ...swap,
                tokenIn: balancerRoute[i]?.tokenPath[index],
                tokenOut: balancerRoute[i]?.tokenPath[index + 1],
              };
            }),
          );
        }
        // console.log(balancerRoute[i].swapInfo?.tokenAddresses,"CHECK")
        if (balancerRoute[i].swapInfo?.tokenAddresses?.length > 2)
          // console.log("CONDITION")
          outputs.push(null);
        else if (balancerRoute[i].swapInfo?.tokenAddresses?.length == 2) {
          limit = balancerRoute[i]?.output;
        }
      }
      outputs.push(Number(output));
    }
    if (
      tokenOut == route.split('>')[route.split('>').length - 1] &&
      !route.split('>').some((val, i) => route.split('>').indexOf(val) !== i) &&
      [...new Set(tokenPath)].length < 5 &&
      tokenExchange.reduce(
        (previousValue, currentValue) => previousValue + currentValue,
        0,
      )
    ) {
      if (tokenExchange.join('') == '101')
        tokenExchange[tokenExchange.length - 1] = 2;
      uniSwapRoute.mergeRoute = true;
      completeRoutes.push({
        exchangeType: 'Merged Route',
        route,
        limit,
        output,
        uniswapOutputs,
        updatedOutput,
        outputs,
        dex: outputs[tokenPath.indexOf(WETH_ADDRESS)],
        tokenPath: [...new Set(tokenPath)],
        tokenExchange,
        // balancerPools,
        ...this.rawTxForSwap(
          tokenExchange,
          [...new Set(tokenPath)],
          balancerPools,
        ),
      });
    }
  };
  rawTxForSwap = (tokenExchange, tokenPath, balancerPools = []) => {
    //for single swap
    let singleSwap;
    let batchflag = 0;
    if (balancerPools.filter((pool) => pool.length == 1)[0]?.length) {
      singleSwap = Object.assign(
        singleSwapTemplate,
        balancerPools.filter((pool) => pool.length == 1)[0][0],
      );
      delete singleSwap.assetInIndex;
      delete singleSwap.assetOutIndex;
      singleSwap = Object.values(singleSwap);
      batchflag = 1;
    }
    //for batch swap
    let assets = [];
    let batchSwap = balancerPools.filter((pool) => pool?.length >= 1)[
      batchflag
    ];
    batchSwap = batchSwap?.map((swap) => {
      assets.push(swap.tokenIn, swap.tokenOut);
      delete swap.tokenIn;
      delete swap.tokenOut;
      return [
        swap.poolId,
        swap.assetInIndex,
        swap.assetOutIndex,
        swap.amount,
        '0x',
      ];
    });
    let path = [];
    let option = [];
    let filter = [];
    if (singleSwap && singleSwap[2] && singleSwap[3]) {
      let index = tokenExchange.findIndex((element) => element == 1);
      if (tokenExchange[index - 1] != 0) {
        filter.push(singleSwap[2]);
      }
      if (tokenExchange[index + 1] != 0) {
        filter.push(singleSwap[3]);
      }
    }
    if (assets?.length) {
      let index = tokenExchange.findIndex((element) => element == 2);

      if (tokenExchange[index - 1] != 0) {
        filter.push(...assets.slice(0, -1));
      }

      if (tokenExchange[index + 1] != 0) {
        filter.push(...assets.slice(1));
      }
    }
    path = tokenPath.filter((item) => !filter.includes(item));
    for (let j = 0; j < path?.length; j++) {
      if (!path[j + 1]) break;
      if (path[j] != WETH_ADDRESS && path[j + 1] == WETH_ADDRESS) {
        option.push(1);
      } else if (path[j] == WETH_ADDRESS && path[j + 1] != WETH_ADDRESS) {
        option.push(2);
      } else if (path[j] != WETH_ADDRESS && path[j + 1] != WETH_ADDRESS) {
        option.push(0);
      }
    }
    let limits = [];
    if (singleSwap) {
      if (singleSwap[2] == WETH_ADDRESS)
        singleSwap[2] = '0x0000000000000000000000000000000000000000';
      else if (singleSwap[3] == WETH_ADDRESS)
        singleSwap[3] = '0x0000000000000000000000000000000000000000';
    }
    if (batchSwap?.length) {
      limits = batchSwap.map((swap) => {
        return swap[3];
      });
      limits.push('0');
    }
    if (assets[0] == WETH_ADDRESS)
      assets[0] = '0x0000000000000000000000000000000000000000';
    if (assets[assets.length - 1] == WETH_ADDRESS)
      assets[assets.length - 1] = '0x0000000000000000000000000000000000000000';
    if (tokenExchange.indexOf(1) == 1) option.splice(1, 1);
    return {
      path: [...new Set(path)],
      option,
      singleSwap,
      batchSwap,
      limits,
      assets: [...new Set(assets)],
    };
  };
  checkRoutesLiquidity = async (routes, amountIn) => {
    routes = routes.filter((route) => route.exchangeType == 'Uniswap V2');

    let newRoutes: any = await Promise.all(
      routes.map((route) => this.getRouteLiquidity(route, amountIn)),
    );
    const networkId = 1;
    // const networkId = Network.KOVAN;
    // Pools source can be Subgraph URL or pools data set passed directly
    const poolsSource =
      'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2';
    const provider = new JsonRpcProvider(
      'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    );
    const sor = new SOR(provider, networkId, poolsSource);
    await sor.fetchPools([], false);
    newRoutes = newRoutes.filter((route) => route);
    await Promise.all(
      newRoutes.map((completeRoute) =>
        this.optimizeUniswapV2(completeRoute, sor, newRoutes),
      ),
    );

    let tempRoutes = [];
    for (let i = 0; i < newRoutes.length; i++) {
      if (newRoutes[i].exchangeType == 'Merged Route') {
        let icon = await this.getTokens(newRoutes[i].tokenPath);
        tempRoutes.push({ ...newRoutes[i], ...icon });
      } else tempRoutes.push(newRoutes[i]);
    }
    newRoutes = tempRoutes;
    if (newRoutes.length) {
      return newRoutes;
    } else {
      return await this.getAggregateRoutes(
        routes[0].tokenPath[0],
        routes[0].tokenPath[routes[0].tokenPath.length - 1],
        amountIn,
        routes[0].route.split('>')[0],
        routes[0].route.split('>')[routes[0].route.length - 1],
        routes[0].outputDecimal[0],
        routes[0].outputDecimal[routes[0].outputDecimal.length - 1],
      );
    }
  };
  getRouteLiquidity = async (route, amountIn) => {
    // console.log(route,amountIn,"-------")
    let poolsDetail: any = await Promise.all(
      route.tokenPath.map((token, index) =>
        this.getPairByToken0Token1(token, route.tokenPath[index + 1]),
      ),
    );
    let outputArray = [amountIn];
    for (let i = 0; i < poolsDetail.filter((pair) => pair).length; i++) {
      if (poolsDetail[i].pairs[0].token0.id === route.tokenPath[i]) {
        let amountOut =
          (outputArray[i] * Number(poolsDetail[i].pairs[0].reserve1)) /
          Number(poolsDetail[i].pairs[0].reserve0);

        if (amountOut > Number(poolsDetail[i].pairs[0].reserve1)) break;
        outputArray.push(amountOut);
      } else {
        let amountOut =
          (outputArray[i] * Number(poolsDetail[i].pairs[0].reserve0)) /
          Number(poolsDetail[i].pairs[0].reserve1);

        if (amountOut > Number(poolsDetail[i].pairs[0].reserve0)) break;
        outputArray.push(amountOut);
      }
    }

    if (route.outputArray.length == outputArray.length) {
      return {
        ...route,
        dex: outputArray[
          route.tokenPath.indexOf('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
        ],
        outputArray,
        output: outputArray[outputArray.length - 1],
      };
    } else return null;
  };
  getPairByToken0Token1 = async (token, tokenOut) => {
    if (tokenOut) {
      let where;
      if (token > tokenOut) {
        where = `token0:"${tokenOut}",token1:"${token}"`;
      } else {
        where = `token0:"${token}",token1:"${tokenOut}"`;
      }
      let pair = await axios({
        url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
        method: 'post',
        data: {
          query: `
        {
          pairs(where:{${where}  },orderBy:txCount,orderDirection:desc  ) {
            id
            token0 {
              id
              decimals
              symbol
            }
            token1 {
              id
              decimals
              symbol
            }
                reserve0
                reserve1
                totalSupply
          }
        }
          
        `,
        },
      });
      return pair.data.data;
    }
  };
}

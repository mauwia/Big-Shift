import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayInit,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Coins } from './app.model';
import { AppService } from './app.service';
import { AggregateMainnetService } from './aggregate-mainnet/aggregate-mainnet.service';

@WebSocketGateway()
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  socket_id: any;
  users: any[] = [];
  onlineUsers: { [key: string]: any } = {};
  constructor(
    @InjectModel('Coins') private readonly coinsModel: Model<Coins>,
    private readonly aggregateMainnetService: AggregateMainnetService,
  ) {}
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('AppGateway');
  @SubscribeMessage('search-tokens')
  async getTokens(client: Socket, payload) {
    // if (payload.search !== '0x') {
    let searchToken = await this.coinsModel.find({
      $or: [
        { symbol: { $regex: new RegExp('^' + payload.search, 'i') } },
        { address: { $regex: new RegExp('^' + payload.search, 'i') } },
        { name: { $regex: new RegExp('^' + payload.search, 'i') } },
      ],
    });
    console.log(searchToken);
    this.server
      .to(client.id)
      .emit('search-token-response', { payload: searchToken });
    // }
  }

  @SubscribeMessage('on-value-type')
  async onValueType(client: Socket, payload) {
    console.log('HERE');
    let { routes, amountIn } = payload;

    let response = await this.aggregateMainnetService.checkRoutesLiquidity(
      routes,
      amountIn,
    );

    this.server.to(client.id).emit('on-value-type-response', response);
  }

  afterInit(server: Server) {
    this.logger.log('Init');
  }

  handleDisconnect(client: Socket) {
    if (this.onlineUsers[client.handshake.query.publicAddress]) {
      delete this.onlineUsers[client.handshake.query.publicAddress];
    }
    this.logger.log(`Client disconnected: ${client.id}`);
    console.log(this.onlineUsers);
  }
  handleConnection(client: Socket, ...args: any[]) {
    console.log(client.handshake.query.publicAddress);
    let { publicAddress } = client.handshake.query;
    this.onlineUsers[publicAddress] = {
      publicAddress: publicAddress,
      socketId: client.id,
    };
    console.log(this.onlineUsers);
  }
}

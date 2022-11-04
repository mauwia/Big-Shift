import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AggregateMainnetModule } from './aggregate-mainnet/aggregate-mainnet.module';
import { AppController } from './app.controller';
import { AppGateway } from './app.gateway';
import { ConfigModule } from '@nestjs/config';

import { CoinSchema } from './app.model';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AggregateMainnetModule,
    MongooseModule.forFeature([{ name: 'Coins', schema: CoinSchema }]),
    MongooseModule.forRoot(
      `mongodb+srv://${process.env.MONGOOSE_USERNAME}:${process.env.MONGOOSE_PASSWORD}@cluster0.k9qmt.mongodb.net/myFirstDatabase1?retryWrites=true&w=majority`,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    
      },
    ),
  ],
  controllers: [AppController],
  providers: [AppService, AppGateway],
})
export class AppModule {}

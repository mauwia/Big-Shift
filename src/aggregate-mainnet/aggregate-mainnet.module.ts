import { Module } from '@nestjs/common';
import { AggregateMainnetService } from './aggregate-mainnet.service';
import { AggregateMainnetController } from './aggregate-mainnet.controller';
import { AppModule } from 'src/app.module';
import { CoinSchema } from 'src/app.model';
import { Mongoose } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: 'Coins',
        schema: CoinSchema,
      },
    ]),
  ],
  providers: [AggregateMainnetService],
  controllers: [AggregateMainnetController],
  exports: [AggregateMainnetService],
})
export class AggregateMainnetModule {}

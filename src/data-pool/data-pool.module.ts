import { Module } from '@nestjs/common';
import { DataPoolController } from './data-pool.controller';
import { DataPoolService } from './data-pool.service';
import { RedisService } from '../redis/redis.service';

@Module({
  controllers: [DataPoolController],
  providers: [DataPoolService, RedisService],
  exports: [DataPoolService]
})
export class DataPoolModule {}

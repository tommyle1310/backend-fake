import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataPoolModule } from './data-pool/data-pool.module';
import { RedisService } from './redis/redis.service';
import { AutoGeneratorModule } from './auto-generator/auto-generator.module';

@Module({
  imports: [
    DataPoolModule,
    AutoGeneratorModule
  ],
  controllers: [AppController],
  providers: [AppService, RedisService],
  exports: [RedisService]
})
export class AppModule {}

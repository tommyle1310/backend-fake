import { Module } from '@nestjs/common';
import { AutoGeneratorService } from './auto-generator.service';
import { DataPoolModule } from '../data-pool/data-pool.module';

@Module({
  imports: [DataPoolModule],
  providers: [AutoGeneratorService],
  exports: [AutoGeneratorService]
})
export class AutoGeneratorModule {} 
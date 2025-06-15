import { Controller, Get, Post, Logger } from '@nestjs/common';
import { DataPoolService } from './data-pool.service';

@Controller('data-pools')
export class DataPoolController {
  private readonly logger = new Logger(DataPoolController.name);

  constructor(private readonly dataPoolService: DataPoolService) {}

  @Get()
  async getDataPools() {
    this.logger.log('Getting data pools...');
    try {
      const pools = await this.dataPoolService.getDataPools();
      return {
        status: 'success',
        data: pools,
        message: 'Data pools retrieved successfully'
      };
    } catch (error) {
      this.logger.error('Error getting data pools:', error);
      return {
        status: 'error',
        data: null,
        message: 'Failed to retrieve data pools'
      };
    }
  }

  @Post('refresh')
  async refreshDataPools() {
    this.logger.log('Refreshing data pools...');
    try {
      const pools = await this.dataPoolService.refreshDataPools();
      return {
        status: 'success',
        data: pools,
        message: 'Data pools refreshed successfully'
      };
    } catch (error) {
      this.logger.error('Error refreshing data pools:', error);
      return {
        status: 'error',
        data: null,
        message: 'Failed to refresh data pools'
      };
    }
  }

  @Post('ensure')
  async ensureDataPools() {
    this.logger.log('Ensuring data pools...');
    try {
      const pools = await this.dataPoolService.ensureDataPools();
      return {
        status: 'success',
        data: pools,
        message: 'Data pools ensured successfully'
      };
    } catch (error) {
      this.logger.error('Error ensuring data pools:', error);
      return {
        status: 'error',
        data: null,
        message: 'Failed to ensure data pools'
      };
    }
  }
}

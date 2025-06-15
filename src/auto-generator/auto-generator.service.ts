import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataPoolService } from '../data-pool/data-pool.service';

@Injectable()
export class AutoGeneratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoGeneratorService.name);
  private isInitialized = false;
  private readonly minInterval = 5000; // 5 seconds
  private readonly maxInterval = 15000; // 15 seconds
  private intervalId: NodeJS.Timeout;

  constructor(private readonly dataPoolService: DataPoolService) {}

  async onModuleInit() {
    this.logger.log('Initializing Auto Generator Service...');
    // First ensure data pools are ready
    await this.dataPoolService.ensureDataPools();
    this.isInitialized = true;
    this.logger.log('Auto Generator Service initialized');
    
    // Start the generation loop
    this.startGenerationLoop();
  }

  private getRandomInterval(): number {
    return Math.floor(Math.random() * (this.maxInterval - this.minInterval + 1)) + this.minInterval;
  }

  private startGenerationLoop() {
    // Check every 5 seconds
    this.intervalId = setInterval(async () => {
      if (!this.isInitialized) {
        this.logger.debug('Waiting for initialization...');
        return;
      }

      try {
        // Random chance to generate (30% chance)
        if (Math.random() > 0.3) {
          return;
        }

        this.logger.log('Starting random data generation...');

        // List of possible entities to generate
        const entities = [
          'Orders',
          'Customers',
          'Drivers',
          'CustomerCares',
          'MenuItems',
          'MenuItemVariants',
          'Promotions'
        ];

        // Randomly select 1-3 entities to generate
        const numEntities = Math.floor(Math.random() * 3) + 1;
        const selectedEntities = new Set<string>();
        
        while (selectedEntities.size < numEntities) {
          selectedEntities.add(entities[Math.floor(Math.random() * entities.length)]);
        }

        // Generate each selected entity
        for (const entity of selectedEntities) {
          this.logger.log(`Generating new ${entity}...`);
          
          // Wait a random interval between generations
          await new Promise(resolve => setTimeout(resolve, this.getRandomInterval()));

          try {
            switch (entity) {
              case 'Orders':
                await this.dataPoolService.ensureOrders();
                break;
              case 'Customers':
                await this.dataPoolService.ensureCustomers();
                break;
              case 'Drivers':
                await this.dataPoolService.ensureDrivers();
                break;
              case 'CustomerCares':
                await this.dataPoolService.ensureCustomerCares();
                break;
              case 'MenuItems':
                await this.dataPoolService.ensureMenuItems();
                break;
              case 'MenuItemVariants':
                await this.dataPoolService.ensureMenuItemVariants();
                break;
              case 'Promotions':
                await this.dataPoolService.ensurePromotions();
                break;
            }
            this.logger.log(`Successfully generated new ${entity}`);
          } catch (error) {
            this.logger.error(`Error generating ${entity}:`, error);
          }
        }

      } catch (error) {
        this.logger.error('Error in auto generation:', error);
      }
    }, 5000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
} 
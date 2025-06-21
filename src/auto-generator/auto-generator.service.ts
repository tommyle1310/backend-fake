import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { DataPoolService } from "../data-pool/data-pool.service";
import axios from "axios";
import { BACKEND_URL } from "../constants";

@Injectable()
export class AutoGeneratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoGeneratorService.name);
  private isInitialized = false;
  private readonly minInterval = 5000; // 5 seconds
  private readonly maxInterval = 15000; // 15 seconds
  private intervalId: NodeJS.Timeout;
  private readonly realBackendUrl = BACKEND_URL;

  constructor(private readonly dataPoolService: DataPoolService) {}

  async onModuleInit() {
    this.logger.log("Initializing Auto Generator Service...");
    // First ensure data pools are ready
    await this.dataPoolService.ensureDataPools();
    this.isInitialized = true;
    this.logger.log("Auto Generator Service initialized");

    // Start the generation loop
    this.startGenerationLoop();
  }

  private getRandomInterval(): number {
    return (
      Math.floor(Math.random() * (this.maxInterval - this.minInterval + 1)) +
      this.minInterval
    );
  }

  private getRandomCount(): number {
    // Generate 1-3 items randomly
    return Math.floor(Math.random() * 3) + 1;
  }

  private async ensureSpecialStatusOrders(): Promise<void> {
    try {
      // Check current orders
      const response = await axios.get(`${this.realBackendUrl}/orders`);
      const currentOrders = response.data?.data || [];

      if (Array.isArray(currentOrders)) {
        const deliveredCount = currentOrders.filter(
          (order) => order.status === "DELIVERED"
        ).length;
        const cancelledCount = currentOrders.filter(
          (order) => order.status === "CANCELLED"
        ).length;

        // Check if we need more DELIVERED orders
        const neededDelivered = Math.max(0, 5 - deliveredCount);
        if (neededDelivered > 0) {
          this.logger.log(
            `Auto-generator ensuring ${neededDelivered} DELIVERED orders...`
          );
          await this.generateSpecialStatusOrders("DELIVERED", neededDelivered);
        }

        // Check if we need more CANCELLED orders
        const neededCancelled = Math.max(0, 2 - cancelledCount);
        if (neededCancelled > 0) {
          this.logger.log(
            `Auto-generator ensuring ${neededCancelled} CANCELLED orders...`
          );
          await this.generateSpecialStatusOrders("CANCELLED", neededCancelled);
        }
      }
    } catch (error) {
      this.logger.error(
        "Error ensuring special status orders in auto-generator:",
        error.message
      );
    }
  }

  private async generateSpecialStatusOrders(
    status: string,
    count: number
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      try {
        // Generate orders with specific status using the generateAdditionalOrders method
        // but override the status
        const orders = await this.dataPoolService.generateAdditionalOrders(1);

        // If order was created successfully, update its status
        if (orders && orders.length > 0) {
          const orderId = orders[0].id;
          if (orderId) {
            // Update the order status
            const updateResponse = await axios.put(
              `${this.realBackendUrl}/orders/${orderId}`,
              { status: status }
            );

            if (updateResponse.data?.EC === 0) {
              this.logger.log(
                `Successfully updated order ${orderId} to ${status} status`
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `Error generating ${status} order ${i + 1}:`,
          error.message
        );
      }
    }
  }

  private startGenerationLoop() {
    // Check every 5 seconds
    this.intervalId = setInterval(async () => {
      if (!this.isInitialized) {
        this.logger.debug("Waiting for initialization...");
        return;
      }

      try {
        // First, ensure we have minimum special status orders (every 10th cycle)
        if (Math.random() < 0.8) {
          // 10% chance to check special orders
          await this.ensureSpecialStatusOrders();
        }

        // Random chance to generate (30% chance)
        if (Math.random() > 0.3) {
          return;
        }

        this.logger.log("Starting random data generation...");

        // List of possible entities to generate
        const entities = [

          'Orders',
          'Customers',
          'Drivers',
          'Restaurants',
          'CustomerCares',
          'MenuItems',
          'MenuItemVariants',
          'Promotions',
          'CustomerCareInquiries',
          'RatingReviews'

        ];

        // Randomly select 1-3 entities to generate
        const numEntities = Math.floor(Math.random() * 3) + 1;
        const selectedEntities = new Set<string>();

        while (selectedEntities.size < numEntities) {
          selectedEntities.add(
            entities[Math.floor(Math.random() * entities.length)]
          );
        }

        // Generate each selected entity
        for (const entity of selectedEntities) {
          const count = this.getRandomCount();
          this.logger.log(`Generating ${count} additional ${entity}...`);

          // Wait a random interval between generations
          await new Promise((resolve) =>
            setTimeout(resolve, this.getRandomInterval())
          );

          try {
            switch (entity) {
              case "Orders":
                await this.dataPoolService.generateAdditionalOrders(
                  count,
                  Math.random() < 0.5
                );
                break;
              case "Customers":
                await this.dataPoolService.generateAdditionalCustomers(
                  count,
                  Math.random() < 0.5
                );
                break;
              case "Drivers":
                await this.dataPoolService.generateAdditionalDrivers(
                  count,
                  Math.random() < 0.5
                );
                break;
              case "Restaurants":
                await this.dataPoolService.generateAdditionalRestaurants(
                  count,
                  Math.random() < 0.5
                );
                break;
              case "CustomerCares":
                await this.dataPoolService.generateAdditionalCustomerCares(
                  count,
                  Math.random() < 0.5
                );
                break;
              case "MenuItems":
                await this.dataPoolService.generateAdditionalMenuItems(count);
                break;
              case "MenuItemVariants":
                await this.dataPoolService.generateAdditionalMenuItemVariants(
                  count
                );
                break;
              case "Promotions":
                await this.dataPoolService.generateAdditionalPromotions(count);
                break;
              case 'CustomerCareInquiries':
                await this.dataPoolService.generateAdditionalCustomerCareInquiries(count);
                break;
              case 'RatingReviews':
                await this.dataPoolService.generateAdditionalRatingReviews(count);
                break;
            }
            this.logger.log(
              `Successfully generated ${count} additional ${entity}`
            );
          } catch (error) {
            this.logger.error(`Error generating additional ${entity}:`, error);
          }
        }
      } catch (error) {
        this.logger.error("Error in auto generation:", error);
      }
    }, 5000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

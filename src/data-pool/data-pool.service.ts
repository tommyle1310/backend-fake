import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
  names,
} from "unique-names-generator";
import { VALID_ORDER_STATUSES } from "src/types/orders";
import { BACKEND_URL } from "src/constants";


@Injectable()
export class DataPoolService implements OnModuleInit {
  private readonly logger = new Logger(DataPoolService.name);
  private readonly realBackendUrl = BACKEND_URL;
  private readonly minPoolSize = 10;
  private readonly cacheKey = "data-pools:all";
  private readonly cacheTtl = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    this.logger.log("Initializing Data Pool Service...");
    await this.ensureDataPools();
  }

  async ensureDataPools(): Promise<any> {
    const start = Date.now();
    this.logger.log("Starting data pool generation process...");

    try {
      // Check cache first
      const cachedPools = await this.redisService.get(this.cacheKey);
      if (cachedPools) {
        this.logger.log(
          `Data pools loaded from cache in ${Date.now() - start}ms`
        );
        return JSON.parse(cachedPools);
      }

      // Generate pools in the specified order
      const pools = {
        addressBooks: await this.ensureAddressBooks(),
        foodCategories: await this.ensureFoodCategories(),
        superAdmins: await this.ensureSuperAdmins(),
        financeAdmins: await this.ensureFinanceAdmins(),
        companionAdmins: await this.ensureCompanionAdmins(),
        financeRules: await this.ensureFinanceRules(),
        restaurants: await this.ensureRestaurants(),
        menuItems: await this.ensureMenuItems(),
        menuItemVariants: await this.ensureMenuItemVariants(),
        promotions: await this.ensurePromotions(),
        drivers: await this.ensureDrivers(),
        customers: await this.ensureCustomers(),
        customerCares: await this.ensureCustomerCares(),
        orders: await this.ensureOrders(),
      };

      // Cache the result
      await this.redisService.set(
        this.cacheKey,
        JSON.stringify(pools),
        this.cacheTtl * 1000
      );

      this.logger.log(
        `Data pools generated and cached in ${Date.now() - start}ms`
      );
      return pools;
    } catch (error) {
      this.logger.error("Error generating data pools:", error);
      throw error;
    }
  }

  private async ensureEntityPool(
    entityName: string,
    getEndpoint: string,
    postEndpoint: string,
    generateData: () => any
  ): Promise<any[]> {
    this.logger.log(
      `Ensuring ${entityName} pool has at least ${this.minPoolSize} items...`
    );

    try {
      // Get current data
      const response = await axios.get(`${this.realBackendUrl}${getEndpoint}`);
      let currentData = response.data?.data || [];

      // Check if the response is successful
      if (response.data?.EC !== 0) {
        this.logger.warn(`Invalid response format for ${entityName}, treating as empty array`);
        currentData = [];
      }

      // Ensure currentData is an array
      if (!Array.isArray(currentData)) {
        this.logger.warn(`Invalid response format for ${entityName}, treating as empty array`);
        currentData = [];
      }

      this.logger.log(`Current ${entityName} count: ${currentData.length}`);

      if (currentData.length >= this.minPoolSize) {
        this.logger.log(`${entityName} pool already has enough data`);
        return currentData.slice(0, this.minPoolSize);
      }

      // Generate missing data
      const needed = this.minPoolSize - currentData.length;
      this.logger.log(`Generating ${needed} ${entityName} items...`);

      const newItems = [];
      let successfulCreations = 0;
      let attempts = 0;
      const maxAttempts = needed * 2; // Allow some retry flexibility

      while (successfulCreations < needed && attempts < maxAttempts) {
        try {
          const itemData = generateData();
          const postResponse = await axios.post(
            `${this.realBackendUrl}${postEndpoint}`,
            itemData
          );

          // Check if request was actually successful
          if (postResponse.data?.EC === 0 && postResponse.data?.data) {
            // For FWallet transactions, we need to ensure the version is properly set
            if (entityName === 'Orders' && itemData.payment_method === 'FWallet') {
              // Get latest wallet versions before creating transactions
              const customerWalletResponse = await axios.get(
                `${this.realBackendUrl}/fwallets/by-user/${itemData.customer_id}`
              );
              const restaurantWalletResponse = await axios.get(
                `${this.realBackendUrl}/fwallets/by-user/${itemData.restaurant_id}`
              );
              const adminWalletResponse = await axios.get(
                `${this.realBackendUrl}/fwallets/by-user/FLASHFOOD_FINANCE`
              );

              if (customerWalletResponse.data?.EC === 0 && 
                  restaurantWalletResponse.data?.EC === 0 && 
                  adminWalletResponse.data?.EC === 0) {
                // Update wallet versions in Redis
                await this.redisService.set(
                  `fwallet:${itemData.customer_id}`,
                  JSON.stringify(customerWalletResponse.data.data),
                  7200 * 1000 // Convert to milliseconds as required by RedisService
                );
                await this.redisService.set(
                  `fwallet:${itemData.restaurant_id}`,
                  JSON.stringify(restaurantWalletResponse.data.data),
                  7200 * 1000
                );
                await this.redisService.set(
                  'fwallet:FLASHFOOD_FINANCE',
                  JSON.stringify(adminWalletResponse.data.data),
                  7200 * 1000
                );

                // Log the updated wallet versions
                this.logger.log('Updated wallet versions in Redis:', {
                  customer: customerWalletResponse.data.data.version,
                  restaurant: restaurantWalletResponse.data.data.version,
                  admin: adminWalletResponse.data.data.version
                });
              }
            }

            newItems.push(postResponse.data.data);
            successfulCreations++;
            this.logger.log(`Successfully created ${entityName} ${successfulCreations}/${needed}`);
          } else {
            this.logger.warn(
              `Failed to create ${entityName} item: Invalid response EC=${postResponse.data?.EC}`
            );
            this.logger.warn(
              `data failed:EM=${postResponse.data?.EM}, data=${postResponse.data?.data}`
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to create ${entityName} item: ${error.message}`
          );
        }
        attempts++;
      }

      if (successfulCreations < needed) {
        this.logger.warn(
          `Could only create ${successfulCreations}/${needed} ${entityName} items after ${attempts} attempts`
        );
      }

      // Return combined data
      const finalData = [...currentData, ...newItems];
      this.logger.log(`${entityName} pool now has ${finalData.length} items`);
      return finalData;
    } catch (error) {
      this.logger.error(`Error ensuring ${entityName} pool:`, error.message);
      return [];
    }
  }

  private async ensureAddressBooks(): Promise<any[]> {
    return this.ensureEntityPool(
      "AddressBooks",
      "/address_books",
      "/address_books",
      () => ({
        street: `${Math.floor(Math.random() * 999) + 1} ${uniqueNamesGenerator({ dictionaries: [adjectives] })} Street`,
        city: uniqueNamesGenerator({ dictionaries: [colors] }),
        nationality: "Vietnam",
        postal_code: Math.floor(Math.random() * 90000) + 10000,
        location: {
          lng: 106.6297 + (Math.random() - 0.5) * 0.1,
          lat: 10.8231 + (Math.random() - 0.5) * 0.1,
        },
        title: `${uniqueNamesGenerator({ dictionaries: [adjectives, colors] })} Location`,
      })
    );
  }

  private async ensureFoodCategories(): Promise<any[]> {
    const categories = [
      "Vietnamese",
      "Chinese",
      "Japanese",
      "Korean",
      "Thai",
      "Italian",
      "American",
      "Mexican",
      "Indian",
      "French",
    ];

    return this.ensureEntityPool(
      "FoodCategories",
      "/food-categories",
      "/food-categories",
      () => {
        const category =
          categories[Math.floor(Math.random() * categories.length)];
        return {
          name: `${category} ${uniqueNamesGenerator({ dictionaries: [adjectives] })}`,
          description: `Delicious ${category.toLowerCase()} cuisine with authentic flavors`,
          avatar: {
            url: "https://via.placeholder.com/300x200",
            key: `food_category_${uuidv4()}`,
          },
        };
      }
    );
  }

  private async ensureSuperAdmins(): Promise<any[]> {
    this.logger.log("Ensuring exactly 1 Super Admin...");

    try {
      // Get current super admins
      const response = await axios.get(
        `${this.realBackendUrl}/admin-fake/by-role/SUPER_ADMIN`
      );
      const currentData = response.data?.data || [];

      this.logger.log(`Current Super Admin count: ${currentData.length}`);

      if (currentData.length >= 1) {
        this.logger.log("Super Admin already exists");
        return currentData.slice(0, 1);
      }

      // Create exactly 1 super admin
      this.logger.log("Creating 1 Super Admin...");
      const itemData = {
        user_id: `USR_${uuidv4()}`,
        email: `superadmin_${uuidv4().slice(0, 8)}@flashfood.com`,
        password: "SuperAdmin123!",
        first_name: uniqueNamesGenerator({ dictionaries: [adjectives] }),
        last_name: uniqueNamesGenerator({ dictionaries: [names] }),
        full_name: uniqueNamesGenerator({ dictionaries: [adjectives, names] }),
        phone_number: `+84${Math.floor(Math.random() * 900000000) + 100000000}`,
      };

      const postResponse = await axios.post(
        `${this.realBackendUrl}/auth/register-super-admin?is-generated=true`,
        itemData
      );

      const newAdmin = postResponse.data?.data ? [postResponse.data.data] : [];
      const finalData = [...currentData, ...newAdmin];
      this.logger.log(`Super Admin pool now has ${finalData.length} items`);
      return finalData.slice(0, 1);
    } catch (error) {
      this.logger.error("Error ensuring Super Admin pool:", error.message);
      return [];
    }
  }

  private async ensureFinanceAdmins(): Promise<any[]> {
    this.logger.log("Ensuring exactly 1 Finance Admin...");

    try {
      // Get current finance admins
      const response = await axios.get(
        `${this.realBackendUrl}/admin-fake/by-role/FINANCE_ADMIN`
      );
      const currentData = response.data?.data || [];

      this.logger.log(`Current Finance Admin count: ${currentData.length}`);

      if (currentData.length >= 1) {
        this.logger.log("Finance Admin already exists");
        return currentData.slice(0, 1);
      }

      // Create exactly 1 finance admin
      this.logger.log("Creating 1 Finance Admin...");
      const itemData = {
        user_id: `USR_${uuidv4()}`,
        email: `financeadmin_${uuidv4().slice(0, 8)}@flashfood.com`,
        password: "FinanceAdmin123!",
        first_name: uniqueNamesGenerator({ dictionaries: [adjectives] }),
        last_name: uniqueNamesGenerator({ dictionaries: [names] }),
        full_name: uniqueNamesGenerator({ dictionaries: [adjectives, names] }),
        phone_number: `+84${Math.floor(Math.random() * 900000000) + 100000000}`,
      };

      const postResponse = await axios.post(
        `${this.realBackendUrl}/auth/register-finance-admin?is-generated=true`,
        itemData
      );

      const newAdmin = postResponse.data?.data ? [postResponse.data.data] : [];
      const finalData = [...currentData, ...newAdmin];
      this.logger.log(`Finance Admin pool now has ${finalData.length} items`);
      return finalData.slice(0, 1);
    } catch (error) {
      this.logger.error("Error ensuring Finance Admin pool:", error.message);
      return [];
    }
  }

  private async ensureCompanionAdmins(): Promise<any[]> {
    this.logger.log("Ensuring exactly 1 Companion Admin...");

    try {
      // Get current companion admins
      const response = await axios.get(
        `${this.realBackendUrl}/admin-fake/by-role/COMPANION_ADMIN`
      );
      const currentData = response.data?.data || [];

      this.logger.log(`Current Companion Admin count: ${currentData.length}`);

      if (currentData.length >= 1) {
        this.logger.log("Companion Admin already exists");
        return currentData.slice(0, 1);
      }

      // Create exactly 1 companion admin
      this.logger.log("Creating 1 Companion Admin...");
      const itemData = {
        user_id: `USR_${uuidv4()}`,
        email: `companionadmin_${uuidv4().slice(0, 8)}@flashfood.com`,
        password: "CompanionAdmin123!",
        first_name: uniqueNamesGenerator({ dictionaries: [adjectives] }),
        last_name: uniqueNamesGenerator({ dictionaries: [names] }),
        full_name: uniqueNamesGenerator({ dictionaries: [adjectives, names] }),
        phone_number: `+84${Math.floor(Math.random() * 900000000) + 100000000}`,
      };

      const postResponse = await axios.post(
        `${this.realBackendUrl}/auth/register-companion-admin?is-generated=true`,
        itemData
      );

      const newAdmin = postResponse.data?.data ? [postResponse.data.data] : [];
      const finalData = [...currentData, ...newAdmin];
      this.logger.log(`Companion Admin pool now has ${finalData.length} items`);
      return finalData.slice(0, 1);
    } catch (error) {
      this.logger.error("Error ensuring Companion Admin pool:", error.message);
      return [];
    }
  }

  private async ensureFinanceRules(): Promise<any[]> {
    // Get super admins first for created_by_id
    const superAdmins = await this.ensureSuperAdmins();

    return this.ensureEntityPool(
      "FinanceRules",
      "/finance-rules",
      "/finance-rules",
      () => {
        // Pick random super admin from actual pool
        const randomSuperAdmin =
          superAdmins[Math.floor(Math.random() * superAdmins.length)];

        return {
          driver_fixed_wage: {
            "0-1km": Math.floor(Math.random() * 3) + 2, // 2-4
            "1-2km": Math.floor(Math.random() * 3) + 3, // 3-5
            "2-3km": Math.floor(Math.random() * 3) + 4, // 4-6
            "3-5km": Math.floor(Math.random() * 3) + 5, // 5-7
            ">5km": "5 + 1.2*km",
          },
          customer_care_hourly_wage: Math.floor(Math.random() * 10) + 15, // 15-25
          app_service_fee: parseFloat((Math.random() * 0.1 + 0.05).toFixed(2)), // 0.05-0.15
          restaurant_commission: parseFloat(
            (Math.random() * 0.1 + 0.1).toFixed(2)
          ), // 0.1-0.2
          created_by_id: randomSuperAdmin?.id || null,
          description: `${uniqueNamesGenerator({ dictionaries: [adjectives] })} finance rule for ${uniqueNamesGenerator({ dictionaries: [colors] })} operations`,
          updated_at: Math.floor(Date.now() / 1000),
        };
      }
    );
  }

  private async ensureRestaurants(): Promise<any[]> {
    // Get address books and food categories first
    const addressBooks = await this.ensureAddressBooks();
    const foodCategories = await this.ensureFoodCategories();

    return this.ensureEntityPool(
      "Restaurants",
      "/restaurants",
      "/auth/register-restaurant?is-generated=true",
      () => {
        // Pick random address and food category from actual pools
        const randomAddress =
          addressBooks[Math.floor(Math.random() * addressBooks.length)];
        const randomFoodCategory =
          foodCategories[Math.floor(Math.random() * foodCategories.length)];

        const restaurantName = uniqueNamesGenerator({
          dictionaries: [adjectives, animals],
        });
        const ownerFirstName = uniqueNamesGenerator({ dictionaries: [names] });
        const ownerLastName = uniqueNamesGenerator({ dictionaries: [colors] });

        return {
          email: `${restaurantName.toLowerCase().replace(/\s+/g, "")}@restaurant.com`,
          first_name: ownerFirstName,
          last_name: ownerLastName,
          password: "000000",
          owner_name: `${ownerFirstName} ${ownerLastName}`,
          restaurant_name: `${restaurantName} Restaurant`,
          address_id: randomAddress?.id || null,
          contact_email: [
            {
              title: "Main Contact",
              email: `contact@${restaurantName.toLowerCase().replace(/\s+/g, "")}.com`,
              is_default: true,
            },
          ],
          contact_phone: [
            {
              title: "Main Contact",
              number: `+84${Math.floor(Math.random() * 900000000) + 100000000}`,
              is_default: true,
            },
          ],
          status: {
            is_active: true,
            is_open: true,
            is_accepted_orders: true,
          },
          opening_hours: {
            mon: { from: 900, to: 2200 },
            tue: { from: 900, to: 2200 },
            wed: { from: 900, to: 2200 },
            thu: { from: 900, to: 2200 },
            fri: { from: 900, to: 2300 },
            sat: { from: 1000, to: 2300 },
            sun: { from: 1000, to: 2200 },
          },
        };
      }
    );
  }

  async ensureMenuItems(): Promise<any[]> {
    const dishes = [
      "Pho",
      "Banh Mi",
      "Spring Rolls",
      "Fried Rice",
      "Noodle Soup",
      "Grilled Chicken",
      "Beef Stew",
      "Fish Curry",
      "Vegetable Stir Fry",
      "Pork Ribs",
    ];

    // Get restaurants and food categories first
    const restaurants = await this.ensureRestaurants();
    const foodCategories = await this.ensureFoodCategories();

    return this.ensureEntityPool(
      "MenuItems",
      "/menu-items",
      "/menu-items",
      () => {
        const dish = dishes[Math.floor(Math.random() * dishes.length)];
        // Pick random restaurant and food category from actual pools
        const randomRestaurant =
          restaurants[Math.floor(Math.random() * restaurants.length)];
        const randomFoodCategory =
          foodCategories[Math.floor(Math.random() * foodCategories.length)];

        const dishName = `${uniqueNamesGenerator({ dictionaries: [adjectives] })} ${dish}`;
        const price = (Math.random() * 200 + 50).toFixed(2); // 50-250
        const descriptions = [
          "Delicious and authentic",
          "Fresh ingredients with traditional flavors",
          "Perfectly seasoned and cooked to perfection",
          "A local favorite with amazing taste",
          "Crispy and flavorful",
        ];
        const description =
          descriptions[Math.floor(Math.random() * descriptions.length)];

        return {
          restaurant_id: randomRestaurant?.id || null,
          name: dishName,
          description: `${description} ${dish.toLowerCase()} prepared with fresh ingredients`,
          price: parseFloat(price),
          category: [randomFoodCategory?.id || null].filter(Boolean),
          avatar: {
            key: `${dishName.toLowerCase().replace(/\s+/g, "-")}-${uuidv4()}`,
            url: "https://via.placeholder.com/300x200",
          },
          availability: true,
          suggest_notes: [
            "Extra sauce",
            "No onions",
            "Spicy",
            "Less salt",
          ].slice(0, Math.floor(Math.random() * 3) + 1),
          variants: [
            {
              variant: "Regular",
              description: `Standard size ${dishName.toLowerCase()}`,
              price: parseFloat(price),
            },
            {
              variant: "Large",
              description: `Large size ${dishName.toLowerCase()} with extra portions`,
              price: parseFloat((parseFloat(price) * 1.3).toFixed(2)),
            },
          ],
        };
      }
    );
  }

  async ensureMenuItemVariants(): Promise<any[]> {
    const sizes = ["Small", "Medium", "Large"];
    const spiceLevels = ["Mild", "Medium", "Spicy", "Extra Spicy"];

    // Get menu items first
    const menuItems = await this.ensureMenuItems();

    return this.ensureEntityPool(
      "MenuItemVariants",
      "/menu-item-variants",
      "/menu-item-variants",
      () => {
        // Pick random menu item from actual pool
        const randomMenuItem =
          menuItems[Math.floor(Math.random() * menuItems.length)];
        const randomSize = sizes[Math.floor(Math.random() * sizes.length)];
        const randomSpiceLevel =
          spiceLevels[Math.floor(Math.random() * spiceLevels.length)];

        const variantName =
          Math.random() > 0.5
            ? randomSize
            : `${randomSize} - ${randomSpiceLevel}`;
        const basePrice = Math.random() * 50 + 20; // 20-70

        return {
          menu_id: randomMenuItem?.id || null,
          variant: variantName,
          description: `${variantName} variant with ${randomSpiceLevel.toLowerCase()} spice level`,
          price: parseFloat(basePrice.toFixed(2)),
          availability: Math.random() > 0.1, // 90% available
        };
      }
    );
  }

  async ensurePromotions(): Promise<any[]> {
    const promoTypes = ["percentage", "fixed_amount", "bogo"];

    // Get food categories first
    const foodCategories = await this.ensureFoodCategories();

    return this.ensureEntityPool(
      "Promotions",
      "/promotions",
      "/promotions",
      () => {
        // Pick random food category from actual pool
        const randomFoodCategory =
          foodCategories[Math.floor(Math.random() * foodCategories.length)];

        const promoNames = [
          "Summer Special",
          "Weekend Deal",
          "Happy Hour",
          "Flash Sale",
          "Mega Discount",
        ];
        const promoName = `${promoNames[Math.floor(Math.random() * promoNames.length)]} ${uniqueNamesGenerator({ dictionaries: [adjectives] })}`;
        const discountTypes = ["PERCENTAGE", "FIXED", "BOGO"];
        const statuses = ["ACTIVE", "PENDING"];

        const discountType =
          discountTypes[Math.floor(Math.random() * discountTypes.length)];
        const discountValue =
          discountType === "PERCENTAGE"
            ? Math.floor(Math.random() * 50) + 5
            : Math.floor(Math.random() * 100) + 10;

        return {
          name: promoName,
          description: `Get amazing ${discountType.toLowerCase()} discounts with our ${promoName.toLowerCase()}`,
          start_date: Math.floor(Date.now() / 1000),
          end_date: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
          discount_type: discountType,
          discount_value: discountValue,
          promotion_cost_price: Math.floor(Math.random() * 200) + 50,
          minimum_order_value: Math.floor(Math.random() * 500) + 100,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          food_category_ids: [randomFoodCategory?.id || null].filter(Boolean),
        };
      }
    );
  }

  async ensureDrivers(): Promise<any[]> {
    // Get address books first
    const addressBooks = await this.ensureAddressBooks();

    return this.ensureEntityPool(
      "Drivers",
      "/drivers",
      "/auth/register-driver?is-generated=true",
      () => {
        // Pick random address from actual pool
        const randomAddress =
          addressBooks[Math.floor(Math.random() * addressBooks.length)];

        const firstName = uniqueNamesGenerator({ dictionaries: [names] });
        const lastName = uniqueNamesGenerator({ dictionaries: [colors] });
        const driverEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@driver.com`;

        return {
          email: driverEmail,
          password: "000000",
          first_name: firstName,
          last_name: lastName,
          contact_email: [
            {
              title: "Primary",
              email: driverEmail,
              is_default: true,
            },
          ],
          contact_phone: [
            {
              title: "Primary",
              number: `+84${Math.floor(Math.random() * 900000000) + 100000000}`,
              is_default: true,
            },
          ],
        };
      }
    );
  }

  async ensureCustomers(): Promise<any[]> {
    return this.ensureEntityPool(
      "Customers",
      "/customers",
      "/auth/register-customer?is-generated=true",
      () => {
        const firstName = uniqueNamesGenerator({ dictionaries: [names] });
        const lastName = uniqueNamesGenerator({ dictionaries: [animals] });
        const customerEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@customer.com`;

        return {
          email: customerEmail,
          first_name: firstName,
          last_name: lastName,
          password: "000000",
        };
      }
    );
  }

  async ensureCustomerCares(): Promise<any[]> {
    return this.ensureEntityPool(
      "CustomerCares",
      "/customer-cares",
      "/auth/register-customer-care?is-generated=true",
      () => {
        const firstName = uniqueNamesGenerator({ dictionaries: [names] });
        const lastName = uniqueNamesGenerator({ dictionaries: [adjectives] });
        const ccEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@support.com`;

        return {
          email: ccEmail,
          first_name: firstName,
          last_name: lastName,
          password: "000000",
        };
      }
    );
  }

  async ensureOrders(): Promise<any[]> {
    // Use the valid order statuses from constants
    const orderStatuses = VALID_ORDER_STATUSES;

    // Get all required data pools first
    const customers = await this.ensureCustomers();
    const restaurants = await this.ensureRestaurants();
    const drivers = await this.ensureDrivers();
    const addressBooks = await this.ensureAddressBooks();
    const menuItems = await this.ensureMenuItems();
    const menuItemVariants = await this.ensureMenuItemVariants();

    return this.ensureEntityPool("Orders", "/orders", "/orders?is-generated=true", () => {
      // Pick random entities from actual pools
      const randomCustomer = customers[Math.floor(Math.random() * customers.length)];
      const randomRestaurant = restaurants[Math.floor(Math.random() * restaurants.length)];
      const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];
      const randomDeliveryAddress = addressBooks[Math.floor(Math.random() * addressBooks.length)];
      const randomPickupAddress = addressBooks[Math.floor(Math.random() * addressBooks.length)];
      const randomMenuItem = menuItems[Math.floor(Math.random() * menuItems.length)];
      const randomMenuItemVariant = menuItemVariants[Math.floor(Math.random() * menuItemVariants.length)];

      const randomStatus = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
      
      // For testing purposes, let's use COD more frequently to avoid wallet issues
      const paymentMethods = ["COD", "COD", "COD", "FWallet"]; // 75% chance of COD
      const randomPaymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

      const totalAmount = Math.random() * 500 + 100; // 100-600
      const deliveryFee = Math.random() * 30 + 15; // 15-45
      const serviceFee = totalAmount * 0.05; // 5% service fee

      const customerNotes = [
        "Please handle with care",
        "Extra spicy please",
        "No onions",
        "Make it crispy",
        "Less salt",
        "Extra sauce on the side",
      ];
      const restaurantNotes = [
        "Customer prefers well-done",
        "Special dietary requirements",
        "Rush order",
        "VIP customer",
        "Handle with care",
      ];

      return {
        customer_id: randomCustomer?.id || null,
        restaurant_id: randomRestaurant?.id || null,
        status: randomStatus, // Already in correct format
        total_amount: parseFloat(totalAmount.toFixed(2)),
        delivery_fee: parseFloat(deliveryFee.toFixed(2)),
        service_fee: parseFloat(serviceFee.toFixed(2)),
        payment_status: randomPaymentMethod === "COD" ? "PENDING" : "PAID",
        payment_method: randomPaymentMethod,
        customer_location: randomDeliveryAddress?.id || null,
        restaurant_location: randomPickupAddress?.id || null,
        order_items: [
          {
            item_id: randomMenuItem?.id || null,
            variant_id: randomMenuItemVariant?.id || null,
            name: randomMenuItem?.name || "Unknown Item",
            quantity: Math.floor(Math.random() * 3) + 1,
            price_at_time_of_order: parseFloat((Math.random() * 100 + 20).toFixed(2)),
          },
        ],
        customer_note: customerNotes[Math.floor(Math.random() * customerNotes.length)],
        restaurant_note: restaurantNotes[Math.floor(Math.random() * restaurantNotes.length)],
        order_time: Math.floor(Date.now() / 1000),
        delivery_time: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 3600) + 1800,
        tracking_info: "ORDER_PLACED", // This is a valid tracking info
      };
    });
  }

  async getDataPools(): Promise<any> {
    const cachedPools = await this.redisService.get(this.cacheKey);
    if (cachedPools) {
      return JSON.parse(cachedPools);
    }
    return this.ensureDataPools();
  }

  async refreshDataPools(): Promise<any> {
    await this.redisService.del(this.cacheKey);
    return this.ensureDataPools();
  }
}

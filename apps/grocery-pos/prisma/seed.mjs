import bcrypt from "bcryptjs";
import { PrismaClient, ProductType, RoleKey } from "@prisma/client";

const database = new PrismaClient();

const demoPassword = process.env.GROCERY_DEMO_PASSWORD;
if (!demoPassword || demoPassword.length < 12) {
  throw new Error("GROCERY_DEMO_PASSWORD must contain at least 12 characters");
}

const roleUsers = [
  [RoleKey.OWNER, "owner"],
  [RoleKey.ADMINISTRATOR, "administrator"],
  [RoleKey.MANAGER, "manager"],
  [RoleKey.CASHIER, "cashier"],
  [RoleKey.INVENTORY_MANAGER, "inventory"],
  [RoleKey.ACCOUNTANT, "accountant"],
  [RoleKey.SALESPERSON, "salesperson"],
  [RoleKey.VIEWER_AUDITOR, "auditor"]
];

const categoryDefinitions = [
  ["PRODUCE", "Fresh Produce"],
  ["DAIRY", "Dairy & Chilled"],
  ["BAKERY", "Bakery"],
  ["GRAINS", "Rice, Flour & Grains"],
  ["BEVERAGES", "Beverages"],
  ["SNACKS", "Snacks"],
  ["FROZEN", "Frozen Foods"],
  ["HOUSEHOLD", "Household"],
  ["PERSONAL", "Personal Care"],
  ["WHOLESALE", "Wholesale Grocery"]
];

async function seed() {
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const business = await database.business.upsert({
    where: { slug: "green-basket-demo" },
    update: {
      name: "Green Basket Supermarket",
      currencyCode: "QAR",
      timezone: "Asia/Qatar",
      active: true
    },
    create: {
      slug: "green-basket-demo",
      name: "Green Basket Supermarket",
      currencyCode: "QAR",
      timezone: "Asia/Qatar"
    }
  });

  const mainBranch = await database.branch.upsert({
    where: { businessId_code: { businessId: business.id, code: "MAIN" } },
    update: { name: "Green Basket Main", active: true },
    create: { businessId: business.id, code: "MAIN", name: "Green Basket Main" }
  });
  const northBranch = await database.branch.upsert({
    where: { businessId_code: { businessId: business.id, code: "NORTH" } },
    update: { name: "Green Basket North", active: true },
    create: { businessId: business.id, code: "NORTH", name: "Green Basket North" }
  });

  const mainWarehouse = await database.warehouse.upsert({
    where: { businessId_code: { businessId: business.id, code: "MAIN-WH" } },
    update: { name: "Main Grocery Warehouse", branchId: mainBranch.id, active: true },
    create: {
      businessId: business.id,
      branchId: mainBranch.id,
      code: "MAIN-WH",
      name: "Main Grocery Warehouse"
    }
  });
  const northWarehouse = await database.warehouse.upsert({
    where: { businessId_code: { businessId: business.id, code: "NORTH-WH" } },
    update: { name: "North Grocery Warehouse", branchId: northBranch.id, active: true },
    create: {
      businessId: business.id,
      branchId: northBranch.id,
      code: "NORTH-WH",
      name: "North Grocery Warehouse"
    }
  });

  for (const [code, name, branchId, warehouseId] of [
    ["MAIN-01", "Main Register 1", mainBranch.id, mainWarehouse.id],
    ["MAIN-02", "Main Register 2", mainBranch.id, mainWarehouse.id],
    ["NORTH-01", "North Register 1", northBranch.id, northWarehouse.id]
  ]) {
    await database.register.upsert({
      where: { businessId_code: { businessId: business.id, code } },
      update: { name, branchId, warehouseId, active: true },
      create: { businessId: business.id, code, name, branchId, warehouseId }
    });
  }

  for (const [role, localPart] of roleUsers) {
    await database.user.upsert({
      where: {
        businessId_email: {
          businessId: business.id,
          email: `${localPart}@greenbasket.example`
        }
      },
      update: {
        displayName: localPart.replace(/(^|\s)\S/g, (character) => character.toUpperCase()),
        passwordHash,
        role,
        status: "ACTIVE",
        failedLoginCount: 0,
        lockedUntil: null
      },
      create: {
        businessId: business.id,
        email: `${localPart}@greenbasket.example`,
        displayName: localPart.replace(/(^|\s)\S/g, (character) => character.toUpperCase()),
        passwordHash,
        role
      }
    });
  }

  const unitDefinitions = [
    ["PCS", "Piece", "pc", 0],
    ["KG", "Kilogram", "kg", 3],
    ["LTR", "Litre", "L", 3],
    ["PACK", "Pack", "pack", 0],
    ["CTN", "Carton", "ctn", 0]
  ];
  const units = new Map();
  for (const [code, name, symbol, decimalScale] of unitDefinitions) {
    const unit = await database.unit.upsert({
      where: { businessId_code: { businessId: business.id, code } },
      update: { name, symbol, decimalScale },
      create: { businessId: business.id, code, name, symbol, decimalScale }
    });
    units.set(code, unit);
  }

  const categories = new Map();
  for (const [code, name] of categoryDefinitions) {
    const category = await database.category.upsert({
      where: { businessId_code: { businessId: business.id, code } },
      update: { name, active: true },
      create: { businessId: business.id, code, name }
    });
    categories.set(code, category);
  }

  const paymentAccounts = [
    ["CASH-MAIN", "Main Cash", "CASH", mainBranch.id],
    ["CARD-CREDIT", "Credit Card Terminal", "CREDIT_CARD", mainBranch.id],
    ["CARD-DEBIT", "Debit Card Terminal", "DEBIT_CARD", mainBranch.id],
    ["BANK-MAIN", "Main Bank Account", "BANK_TRANSFER", mainBranch.id],
    ["WALLET", "Mobile Wallet", "MOBILE_WALLET", mainBranch.id],
    ["CHEQUE", "Cheque Clearing", "CHEQUE", mainBranch.id]
  ];
  for (const [code, name, methodType, branchId] of paymentAccounts) {
    await database.paymentAccount.upsert({
      where: { businessId_code: { businessId: business.id, code } },
      update: { name, methodType, branchId, active: true },
      create: {
        businessId: business.id,
        branchId,
        code,
        name,
        methodType,
        currencyCode: "QAR"
      }
    });
  }

  for (let index = 1; index <= 10; index += 1) {
    const code = `SUP-${String(index).padStart(3, "0")}`;
    await database.supplier.upsert({
      where: { businessId_code: { businessId: business.id, code } },
      update: { name: `Grocery Supplier ${index}`, active: true },
      create: {
        businessId: business.id,
        code,
        name: `Grocery Supplier ${index}`,
        phone: `+9745000${String(index).padStart(4, "0")}`,
        email: `supplier${index}@greenbasket.example`
      }
    });
  }

  for (let index = 1; index <= 100; index += 1) {
    const code = `CUS-${String(index).padStart(4, "0")}`;
    await database.customer.upsert({
      where: { businessId_code: { businessId: business.id, code } },
      update: { name: `Green Basket Customer ${index}`, active: true },
      create: {
        businessId: business.id,
        code,
        name: `Green Basket Customer ${index}`,
        phone: `+97466${String(index).padStart(6, "0")}`,
        email: `customer${index}@greenbasket.example`,
        creditEnabled: index % 5 === 0,
        creditLimit: index % 5 === 0 ? "2500.00" : "0.00"
      }
    });
  }

  const categoryCodes = categoryDefinitions.map(([code]) => code);
  for (let index = 1; index <= 500; index += 1) {
    const categoryCode = categoryCodes[(index - 1) % categoryCodes.length];
    const category = categories.get(categoryCode);
    const weighted = index % 10 === 0;
    const baseUnit = weighted ? units.get("KG") : units.get("PCS");
    const sku = `GB-${String(index).padStart(5, "0")}`;
    const costPrice = (1 + (index % 37) * 0.37).toFixed(4);
    const retailPrice = (Number(costPrice) * 1.28).toFixed(4);

    const product = await database.product.upsert({
      where: { businessId_sku: { businessId: business.id, sku } },
      update: {
        categoryId: category.id,
        baseUnitId: baseUnit.id,
        name: `${category.name} Item ${index}`,
        type: weighted ? ProductType.WEIGHTED : ProductType.STANDARD,
        trackBatches: index % 4 === 0,
        trackExpiry: index % 3 === 0,
        costPrice,
        retailPrice,
        minimumStock: weighted ? "15.0000" : "12.0000",
        reorderQuantity: weighted ? "30.0000" : "24.0000",
        active: true
      },
      create: {
        businessId: business.id,
        categoryId: category.id,
        baseUnitId: baseUnit.id,
        sku,
        plu: weighted ? String(20000 + index) : null,
        name: `${category.name} Item ${index}`,
        type: weighted ? ProductType.WEIGHTED : ProductType.STANDARD,
        trackBatches: index % 4 === 0,
        trackExpiry: index % 3 === 0,
        costPrice,
        retailPrice,
        minimumStock: weighted ? "15.0000" : "12.0000",
        reorderQuantity: weighted ? "30.0000" : "24.0000",
        taxRate: "0.000000"
      }
    });

    const barcode = `629${String(index).padStart(10, "0")}`;
    await database.productBarcode.upsert({
      where: { businessId_barcode: { businessId: business.id, barcode } },
      update: { productId: product.id, isPrimary: true },
      create: { businessId: business.id, productId: product.id, barcode, isPrimary: true }
    });

    if (!weighted && index % 5 === 0) {
      await database.unitConversion.upsert({
        where: {
          businessId_productId_fromUnitId_toUnitId: {
            businessId: business.id,
            productId: product.id,
            fromUnitId: units.get("CTN").id,
            toUnitId: units.get("PCS").id
          }
        },
        update: { factor: "24.000000" },
        create: {
          businessId: business.id,
          productId: product.id,
          fromUnitId: units.get("CTN").id,
          toUnitId: units.get("PCS").id,
          factor: "24.000000"
        }
      });
    }
  }

  console.log(JSON.stringify({
    seeded: true,
    business: business.slug,
    branches: 2,
    warehouses: 2,
    registers: 3,
    roles: roleUsers.length,
    suppliers: 10,
    customers: 100,
    products: 500
  }));
}

seed()
  .catch((error) => {
    console.error("Grocery seed failed", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.$disconnect();
  });

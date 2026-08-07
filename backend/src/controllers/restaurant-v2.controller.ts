import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;

function businessId(request: Request): string | null {
  return request.tenant?.businessId ?? null;
}

function userId(request: Request): string | null {
  return request.tenant?.userId ?? null;
}

function ok(response: Response, data: unknown, status = 200) {
  return response.status(status).json({ ok: true, data });
}

function fail(response: Response, message: string, status = 400) {
  return response.status(status).json({ ok: false, error: { message } });
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function numberValue(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function idempotencyKey(request: Request): string | null {
  return text(request.header("Idempotency-Key") || request.header("X-Idempotency-Key"));
}

function restaurantMethod(value: unknown): string {
  const method = String(value ?? "cash").trim().toLowerCase();
  if (method.includes("bank") || method.includes("transfer")) return "bank transfer";
  if (method.includes("debit")) return "debit card";
  if (method.includes("credit") && method.includes("card")) return "credit card";
  if (method.includes("card") || method.includes("pos")) return "card";
  if (method.includes("wallet")) return "wallet";
  if (method.includes("cheque") || method.includes("check")) return "cheque";
  return "cash";
}

function orderView(order: any) {
  if (!order) return null;
  return {
    ...order,
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount || 0),
    serviceCharge: Number(order.serviceCharge || 0),
    tip: Number(order.tip || 0),
    total: Number(order.total || 0)
  };
}

function itemView(item: any) {
  return {
    ...item,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
    lineTotal: Number(item.lineTotal || 0)
  };
}

export async function restaurantContext(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);

    const [areas, tables, categories, menuItems, modifierGroups, modifiers, openOrders] = await Promise.all([
      db.restaurantArea.findMany({
        where: { businessId: bid, active: true },
        orderBy: { name: "asc" }
      }),
      db.restaurantTable.findMany({
        where: { businessId: bid, active: true },
        orderBy: { tableNo: "asc" }
      }),
      db.restaurantMenuCategory.findMany({
        where: { businessId: bid, active: true },
        orderBy: { name: "asc" }
      }),
      db.restaurantMenuItem.findMany({
        where: { businessId: bid, active: true },
        orderBy: { name: "asc" }
      }),
      db.restaurantModifierGroup.findMany({
        where: { businessId: bid, active: true },
        orderBy: { name: "asc" }
      }),
      db.restaurantModifier.findMany({
        where: { businessId: bid, active: true },
        orderBy: { name: "asc" }
      }),
      db.restaurantOrder.findMany({
        where: { businessId: bid, status: { notIn: ["closed", "cancelled"] } },
        orderBy: { createdAt: "desc" },
        take: 200
      })
    ]);

    const areaById = new Map(areas.map((area: any) => [String(area.id), area]));
    const categoryById = new Map(categories.map((category: any) => [String(category.id), category]));
    const openOrderByTable = new Map(
      openOrders
        .filter((order: any) => order.tableId)
        .map((order: any) => [String(order.tableId), orderView(order)])
    );

    return ok(response, {
      currentUserId: userId(request),
      areas,
      tables: tables.map((table: any) => ({
        ...table,
        area: table.areaId ? areaById.get(String(table.areaId)) ?? null : null,
        openOrder: openOrderByTable.get(String(table.id)) ?? null
      })),
      categories,
      menuItems: menuItems.map((item: any) => ({
        ...item,
        price: Number(item.price || 0),
        category: item.categoryId ? categoryById.get(String(item.categoryId)) ?? null : null
      })),
      modifierGroups: modifierGroups.map((group: any) => ({
        ...group,
        modifiers: modifiers
          .filter((modifier: any) => String(modifier.groupId) === String(group.id))
          .map((modifier: any) => ({ ...modifier, priceDelta: Number(modifier.priceDelta || 0) }))
      })),
      openOrders: openOrders.map(orderView)
    });
  } catch (error) {
    console.error("restaurantContext failed", error);
    return fail(response, "Restaurant context could not be loaded", 500);
  }
}

export async function restaurantAreas(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    return ok(response, await db.restaurantArea.findMany({
      where: { businessId: bid, active: true },
      orderBy: { name: "asc" }
    }));
  } catch (error) {
    console.error("restaurantAreas failed", error);
    return fail(response, "Restaurant areas could not be loaded", 500);
  }
}

export async function restaurantAreaCreate(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    const name = text(request.body?.name);
    if (!name) return fail(response, "Area name is required");

    const row = await db.restaurantArea.create({
      data: { businessId: bid, name }
    });
    await writeAudit(db, request, {
      businessId: bid,
      userId: userId(request),
      action: "restaurant.area.create",
      entityType: "RestaurantArea",
      entityId: row.id,
      after: row
    });
    return ok(response, row, 201);
  } catch (error: any) {
    console.error("restaurantAreaCreate failed", error);
    if (error?.code === "P2002") return fail(response, "An area with this name already exists", 409);
    return fail(response, "Restaurant area could not be created", 500);
  }
}

export async function restaurantTableStatus(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    const allowed = ["available", "occupied", "reserved", "cleaning", "out_of_service"];
    const status = String(request.body?.status ?? "").trim().toLowerCase();
    if (!allowed.includes(status)) return fail(response, "Invalid table status");

    const table = await db.restaurantTable.findFirst({
      where: { id: request.params.id, businessId: bid, active: true }
    });
    if (!table) return fail(response, "Restaurant table not found", 404);

    if (status === "available") {
      const openOrder = await db.restaurantOrder.findFirst({
        where: {
          businessId: bid,
          tableId: table.id,
          status: { notIn: ["closed", "cancelled"] }
        },
        select: { id: true, orderNo: true }
      });
      if (openOrder) {
        return fail(response, `Table still has open order ${openOrder.orderNo}`, 409);
      }
    }

    const updated = await db.restaurantTable.update({
      where: { id: table.id },
      data: { status }
    });
    await writeAudit(db, request, {
      businessId: bid,
      userId: userId(request),
      action: "restaurant.table.status",
      entityType: "RestaurantTable",
      entityId: table.id,
      before: table,
      after: updated
    });
    return ok(response, updated);
  } catch (error) {
    console.error("restaurantTableStatus failed", error);
    return fail(response, "Table status could not be updated", 500);
  }
}

export async function restaurantOrderDetail(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    const order = await db.restaurantOrder.findFirst({
      where: { id: request.params.id, businessId: bid }
    });
    if (!order) return fail(response, "Restaurant order not found", 404);

    const [items, kitchenTickets, table] = await Promise.all([
      db.restaurantOrderItem.findMany({
        where: { businessId: bid, orderId: order.id },
        orderBy: { id: "asc" }
      }),
      db.restaurantKitchenTicket.findMany({
        where: { businessId: bid, orderId: order.id },
        orderBy: { createdAt: "asc" }
      }),
      order.tableId
        ? db.restaurantTable.findFirst({ where: { id: order.tableId, businessId: bid } })
        : Promise.resolve(null)
    ]);

    return ok(response, {
      ...orderView(order),
      table,
      items: items.map(itemView),
      kitchenTickets
    });
  } catch (error) {
    console.error("restaurantOrderDetail failed", error);
    return fail(response, "Restaurant order could not be loaded", 500);
  }
}

export async function restaurantKitchenBoard(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    const status = text(request.query.status);
    const where: any = { businessId: bid };
    if (status) where.status = status;
    else where.status = { not: "completed" };

    const tickets = await db.restaurantKitchenTicket.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 200
    });
    const orderIds = [...new Set(tickets.map((ticket: any) => String(ticket.orderId)))];
    const [orders, items] = await Promise.all([
      orderIds.length
        ? db.restaurantOrder.findMany({ where: { businessId: bid, id: { in: orderIds } } })
        : Promise.resolve([]),
      orderIds.length
        ? db.restaurantOrderItem.findMany({
            where: { businessId: bid, orderId: { in: orderIds } },
            orderBy: { id: "asc" }
          })
        : Promise.resolve([])
    ]);
    const orderById = new Map(orders.map((order: any) => [String(order.id), orderView(order)]));

    return ok(response, tickets.map((ticket: any) => ({
      ...ticket,
      order: orderById.get(String(ticket.orderId)) ?? null,
      items: items
        .filter((item: any) => String(item.orderId) === String(ticket.orderId))
        .map(itemView)
    })));
  } catch (error) {
    console.error("restaurantKitchenBoard failed", error);
    return fail(response, "Kitchen board could not be loaded", 500);
  }
}

export async function restaurantKitchenStatus(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    const allowed = ["queued", "preparing", "ready", "completed"];
    const status = String(request.body?.status ?? "").trim().toLowerCase();
    if (!allowed.includes(status)) return fail(response, "Invalid kitchen status");

    const ticket = await db.restaurantKitchenTicket.findFirst({
      where: { id: request.params.id, businessId: bid }
    });
    if (!ticket) return fail(response, "Kitchen ticket not found", 404);

    const preparationStatus = status === "queued"
      ? "pending"
      : status === "completed"
        ? "ready"
        : status;

    const result = await db.$transaction(async (transaction: any) => {
      const updatedTicket = await transaction.restaurantKitchenTicket.update({
        where: { id: ticket.id },
        data: {
          status,
          completedAt: status === "completed" ? new Date() : null
        }
      });
      await transaction.restaurantOrderItem.updateMany({
        where: { businessId: bid, orderId: ticket.orderId },
        data: { preparationStatus }
      });
      if (status === "preparing" || status === "ready") {
        await transaction.restaurantOrder.updateMany({
          where: {
            id: ticket.orderId,
            businessId: bid,
            status: { notIn: ["closed", "cancelled"] }
          },
          data: { status }
        });
      }
      await writeAudit(transaction, request, {
        businessId: bid,
        userId: userId(request),
        action: "restaurant.kitchen.status",
        entityType: "RestaurantKitchenTicket",
        entityId: ticket.id,
        before: ticket,
        after: updatedTicket
      });
      return updatedTicket;
    });
    return ok(response, result);
  } catch (error) {
    console.error("restaurantKitchenStatus failed", error);
    return fail(response, "Kitchen ticket status could not be updated", 500);
  }
}

export async function restaurantModifiers(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    const [groups, modifiers] = await Promise.all([
      db.restaurantModifierGroup.findMany({
        where: { businessId: bid, active: true },
        orderBy: { name: "asc" }
      }),
      db.restaurantModifier.findMany({
        where: { businessId: bid, active: true },
        orderBy: { name: "asc" }
      })
    ]);
    return ok(response, groups.map((group: any) => ({
      ...group,
      modifiers: modifiers
        .filter((modifier: any) => String(modifier.groupId) === String(group.id))
        .map((modifier: any) => ({ ...modifier, priceDelta: Number(modifier.priceDelta || 0) }))
    })));
  } catch (error) {
    console.error("restaurantModifiers failed", error);
    return fail(response, "Modifiers could not be loaded", 500);
  }
}

export async function restaurantRecipes(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    if (!bid) return fail(response, "Authenticated business is required", 401);
    const recipes = await db.restaurantRecipe.findMany({
      where: { businessId: bid, active: true },
      orderBy: { id: "asc" }
    });
    const recipeIds = recipes.map((recipe: any) => String(recipe.id));
    const menuItemIds = recipes.map((recipe: any) => String(recipe.menuItemId));
    const ingredients = recipeIds.length
      ? await db.restaurantRecipeIngredient.findMany({
          where: { businessId: bid, recipeId: { in: recipeIds } }
        })
      : [];
    const productIds = [...new Set(ingredients.map((ingredient: any) => String(ingredient.productId)))];
    const [menuItems, products] = await Promise.all([
      menuItemIds.length
        ? db.restaurantMenuItem.findMany({ where: { businessId: bid, id: { in: menuItemIds } } })
        : Promise.resolve([]),
      productIds.length
        ? db.product.findMany({
            where: { businessId: bid, id: { in: productIds }, deleted: false },
            select: { id: true, sku: true, name: true, unit: true, costPrice: true }
          })
        : Promise.resolve([])
    ]);
    const menuById = new Map(menuItems.map((item: any) => [String(item.id), item]));
    const productById = new Map(products.map((product: any) => [String(product.id), product]));

    return ok(response, recipes.map((recipe: any) => ({
      ...recipe,
      yieldQuantity: Number(recipe.yieldQuantity || 0),
      menuItem: menuById.get(String(recipe.menuItemId)) ?? null,
      ingredients: ingredients
        .filter((ingredient: any) => String(ingredient.recipeId) === String(recipe.id))
        .map((ingredient: any) => ({
          ...ingredient,
          quantity: Number(ingredient.quantity || 0),
          product: productById.get(String(ingredient.productId)) ?? null
        }))
    })));
  } catch (error) {
    console.error("restaurantRecipes failed", error);
    return fail(response, "Recipes could not be loaded", 500);
  }
}

export async function restaurantSettleOrder(request: Request, response: Response) {
  try {
    const bid = businessId(request);
    const uid = userId(request);
    if (!bid || !uid) return fail(response, "Authenticated business and user are required", 401);
    const key = idempotencyKey(request);
    if (!key) return fail(response, "Idempotency-Key is required for settlement");

    const paymentInput = Array.isArray(request.body?.payments) ? request.body.payments : [];
    if (!paymentInput.length) return fail(response, "At least one payment is required");

    const result = await db.$transaction(async (transaction: any) => {
      await transaction.$queryRawUnsafe(
        "SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))",
        `axtor:restaurant-settlement:${bid}:${key}`
      );

      const duplicate = await transaction.customerPayment.findFirst({
        where: { businessId: bid, idempotencyKey: `${key}:payment:1` }
      });
      if (duplicate) {
        const order = await transaction.restaurantOrder.findFirst({
          where: { id: request.params.id, businessId: bid }
        });
        const payments = await transaction.customerPayment.findMany({
          where: { businessId: bid },
          orderBy: { createdAt: "asc" },
          take: 500
        });
        return {
          duplicate: true,
          order: orderView(order),
          payments: payments.filter((payment: any) => String(payment.idempotencyKey || "").startsWith(`${key}:payment:`)),
          changeDue: 0
        };
      }

      const order = await transaction.restaurantOrder.findFirst({
        where: {
          id: request.params.id,
          businessId: bid,
          status: { notIn: ["closed", "cancelled"] }
        }
      });
      if (!order) throw new Error("Open restaurant order not found");

      const discount = Math.max(0, numberValue(request.body?.discount, Number(order.discount || 0)));
      const serviceCharge = Math.max(0, numberValue(request.body?.serviceCharge, Number(order.serviceCharge || 0)));
      const tip = Math.max(0, numberValue(request.body?.tip, Number(order.tip || 0)));
      const finalTotal = money(Math.max(0, Number(order.subtotal || 0) - discount + serviceCharge + tip));
      const payments = paymentInput
        .map((line: any) => ({
          method: restaurantMethod(line.method),
          tendered: money(Math.max(0, numberValue(line.amount))),
          accountId: text(line.accountId),
          referenceNo: text(line.referenceNo || line.reference)
        }))
        .filter((line: any) => line.tendered > 0);
      if (!payments.length) throw new Error("Positive payment amount is required");

      const tenderedTotal = money(payments.reduce((sum: number, line: any) => sum + line.tendered, 0));
      if (tenderedTotal + 0.001 < finalTotal) {
        throw new Error(`Payment is short by ${money(finalTotal - tenderedTotal).toFixed(2)}`);
      }
      if (tenderedTotal > finalTotal + 0.001 && !(payments.length === 1 && payments[0].method === "cash")) {
        throw new Error("Only a single cash payment may exceed the bill total for change");
      }

      const accountIds = [...new Set(payments.map((line: any) => line.accountId).filter(Boolean))];
      const accounts = accountIds.length
        ? await transaction.account.findMany({
            where: { businessId: bid, id: { in: accountIds }, active: true }
          })
        : [];
      if (accounts.length !== accountIds.length) throw new Error("One or more payment accounts are invalid");

      let remaining = finalTotal;
      const createdPayments: any[] = [];
      for (let index = 0; index < payments.length; index += 1) {
        const line = payments[index];
        const applied = money(Math.min(remaining, line.tendered));
        remaining = money(Math.max(0, remaining - applied));
        if (applied <= 0) continue;

        const receiptNo = `RST-${order.orderNo}-${String(index + 1).padStart(2, "0")}`;
        const payment = await transaction.customerPayment.create({
          data: {
            businessId: bid,
            receiptNo,
            customerId: null,
            customerName: order.customerName || "Walk-in Customer",
            amount: applied,
            currency: "QAR",
            exchangeRate: 1,
            baseAmount: applied,
            exchangeRateSource: "restaurant_settlement",
            exchangeRateTimestamp: new Date(),
            method: line.method,
            accountId: line.accountId,
            referenceNo: line.referenceNo,
            idempotencyKey: `${key}:payment:${index + 1}`,
            paymentDate: new Date(),
            allocation: {
              source: "restaurant_settlement",
              restaurantOrderId: order.id,
              restaurantOrderNo: order.orderNo,
              tableId: order.tableId,
              waiterId: order.waiterId || uid,
              tenderedAmount: line.tendered,
              appliedAmount: applied
            }
          }
        });
        createdPayments.push(payment);

        if (line.accountId) {
          await transaction.account.update({
            where: { id: line.accountId },
            data: { currentBalance: { increment: applied } }
          });
          await transaction.accountTransaction.create({
            data: {
              businessId: bid,
              accountId: line.accountId,
              type: "receipt",
              amount: applied,
              referenceNo: line.referenceNo || receiptNo,
              description: `Restaurant settlement ${order.orderNo}`,
              transactionDate: new Date(),
              sourceType: "restaurant_order",
              sourceId: order.id,
              createdByUserId: uid
            }
          });
        }
      }

      const updatedOrder = await transaction.restaurantOrder.update({
        where: { id: order.id },
        data: {
          discount,
          serviceCharge,
          tip,
          total: finalTotal,
          status: "closed",
          closedAt: new Date()
        }
      });
      await transaction.restaurantKitchenTicket.updateMany({
        where: { businessId: bid, orderId: order.id, status: { not: "completed" } },
        data: { status: "completed", completedAt: new Date() }
      });
      await transaction.restaurantOrderItem.updateMany({
        where: { businessId: bid, orderId: order.id },
        data: { preparationStatus: "ready" }
      });
      if (order.tableId) {
        await transaction.restaurantTable.updateMany({
          where: { id: order.tableId, businessId: bid },
          data: { status: "available" }
        });
      }
      await writeAudit(transaction, request, {
        businessId: bid,
        userId: uid,
        action: "restaurant.order.settle",
        entityType: "RestaurantOrder",
        entityId: order.id,
        before: order,
        after: {
          order: updatedOrder,
          paymentIds: createdPayments.map((payment) => payment.id),
          tenderedTotal,
          changeDue: money(Math.max(0, tenderedTotal - finalTotal))
        }
      });

      return {
        duplicate: false,
        order: orderView(updatedOrder),
        payments: createdPayments.map((payment) => ({
          ...payment,
          amount: Number(payment.amount || 0),
          baseAmount: Number(payment.baseAmount || 0)
        })),
        tenderedTotal,
        changeDue: money(Math.max(0, tenderedTotal - finalTotal))
      };
    });

    return ok(response, result, result.duplicate ? 200 : 201);
  } catch (error: any) {
    console.error("restaurantSettleOrder failed", error);
    return fail(response, error?.message || "Restaurant order could not be settled", 400);
  }
}

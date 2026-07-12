export async function nextEntityNumber(
  tx: any,
  modelName: string,
  fieldName: string,
  businessId: string,
  prefix: string,
  padding = 6
): Promise<string> {
  const model = tx[modelName];
  if (!model?.findMany) return `${prefix}-${String(Date.now()).slice(-padding)}`;
  const rows = await model.findMany({
    where: { businessId },
    select: { [fieldName]: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  let max = 0;
  for (const row of rows) {
    const raw = String(row[fieldName] || "");
    const match = raw.match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  }
  return `${prefix}-${String(max + 1).padStart(padding, "0")}`;
}

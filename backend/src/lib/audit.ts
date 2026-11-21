import { Prisma } from '@prisma/client';
import { prisma, type Db } from './prisma';
import { ownerIdOf, type AuthUser } from './scope';

export async function audit(
  user: AuthUser | null,
  action: string,
  entity: string,
  entityId: number | null,
  oldData?: unknown,
  newData?: unknown,
  db: Db = prisma,
  ownerId?: number | null,
) {
  const json = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
  await db.auditLog.create({
    data: {
      userId: user?.id ?? null,
      ownerId: ownerId ?? (user ? ownerIdOf(user) : null),
      action,
      entity,
      entityId,
      oldData: json(oldData),
      newData: json(newData),
    },
  });
}

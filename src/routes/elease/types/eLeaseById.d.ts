import { Prisma } from 'generated/prisma/client';

export type ELeaseById = Prisma.ELeaseGetPayload<{
  include: {
    leaseItems: true;
    lessee: {
      include: { client: true };
    };
  };
}>;

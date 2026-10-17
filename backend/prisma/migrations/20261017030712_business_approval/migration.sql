-- CreateTable
CREATE TABLE "business_approvals" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "approvedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "business_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_approvals_phone_key" ON "business_approvals"("phone");

-- AddForeignKey
ALTER TABLE "business_approvals" ADD CONSTRAINT "business_approvals_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "business_approvals"
ADD CONSTRAINT "business_approval_role_check"
CHECK("role"::text IN('AGENT','MERCHANT'));

ALTER TABLE "wallets"
ADD CONSTRAINT "wallet_owner_by_type_check"
CHECK (
    ("type"::text = 'SYSTEM' AND "userId" IS NULL)
  OR
  ("type"::text IN ('PERSONAL', 'AGENT', 'MERCHANT') AND "userId" IS NOT NULL)
);
-- CreateTable
CREATE TABLE "payroll_profiles" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "classification" TEXT NOT NULL DEFAULT 'W2',
    "ein" TEXT NOT NULL DEFAULT '',
    "ssn" TEXT NOT NULL DEFAULT '',
    "account_number" TEXT NOT NULL DEFAULT '',
    "garnishment_active" BOOLEAN NOT NULL DEFAULT false,
    "child_support_active" BOOLEAN NOT NULL DEFAULT false,
    "child_support_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overpayment_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ytd_gross_override" DECIMAL(10,2),
    "ytd_deductions_override" DECIMAL(10,2),
    "ytd_net_override" DECIMAL(10,2),
    "ytd_overpayment_override" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_receipts" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "pay_date" TIMESTAMP(3) NOT NULL,
    "total_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hourly_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gross_earnings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "garnishment" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "child_support" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overpayment_deduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ytd_gross" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ytd_deductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ytd_overpayments" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ytd_net" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "classification" TEXT NOT NULL DEFAULT 'W2',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "email_sent_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_profiles_employee_id_key" ON "payroll_profiles"("employee_id");

-- CreateIndex
CREATE INDEX "pay_receipts_employee_id_idx" ON "pay_receipts"("employee_id");

-- CreateIndex
CREATE INDEX "pay_receipts_period_start_idx" ON "pay_receipts"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "pay_receipts_employee_id_period_start_key" ON "pay_receipts"("employee_id", "period_start");

-- AddForeignKey
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_receipts" ADD CONSTRAINT "pay_receipts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

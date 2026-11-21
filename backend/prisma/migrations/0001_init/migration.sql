-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "landlord_id" INTEGER,
    "tenant_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "properties" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "description" TEXT,
    "floors" INTEGER NOT NULL DEFAULT 1,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "electricity_price" DECIMAL NOT NULL DEFAULT 3500,
    "water_price" DECIMAL NOT NULL DEFAULT 20000,
    "water_mode" TEXT NOT NULL DEFAULT 'METER',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "services" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "property_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PER_ROOM',
    "price" DECIMAL NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "services_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "property_id" INTEGER NOT NULL,
    "room_number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "area" DECIMAL,
    "price" DECIMAL NOT NULL,
    "max_occupancy" INTEGER NOT NULL DEFAULT 2,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "meter_device_id" TEXT,
    "meter_name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "room_images" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "room_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_images_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "id_number" TEXT,
    "date_of_birth" DATETIME,
    "gender" TEXT,
    "permanent_address" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tenants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contract_number" TEXT NOT NULL,
    "room_id" INTEGER NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "rent_price" DECIMAL NOT NULL,
    "deposit" DECIMAL NOT NULL DEFAULT 0,
    "payment_due_day" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "terms" TEXT,
    "notes" TEXT,
    "ended_at" DATETIME,
    "end_reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "contracts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contract_tenants" (
    "contract_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" DATETIME NOT NULL,
    "left_at" DATETIME,

    PRIMARY KEY ("contract_id", "tenant_id"),
    CONSTRAINT "contract_tenants_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contract_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "room_id" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "electricity_prev" DECIMAL NOT NULL,
    "electricity_curr" DECIMAL NOT NULL,
    "electricity_price" DECIMAL NOT NULL,
    "water_prev" DECIMAL NOT NULL,
    "water_curr" DECIMAL NOT NULL,
    "water_price" DECIMAL NOT NULL,
    "reading_date" DATETIME NOT NULL,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "meter_readings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_number" TEXT NOT NULL,
    "room_id" INTEGER NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "period_key" TEXT,
    "issue_date" DATETIME NOT NULL,
    "due_date" DATETIME NOT NULL,
    "total_amount" DECIMAL NOT NULL,
    "paid_amount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "note" TEXT,
    "cancelled_at" DATETIME,
    "cancel_reason" TEXT,
    "payment_reference" TEXT,
    "zalo_sent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "invoices_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoice_details" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unit_price" DECIMAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "invoice_details_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "receipt_number" TEXT,
    "invoice_id" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "method" TEXT NOT NULL,
    "payment_date" DATETIME NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "created_by" INTEGER,
    "voided_at" DATETIME,
    "void_reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" INTEGER,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "expense_categories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "property_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "entry_date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "maintenance_request_id" INTEGER,
    "created_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "expenses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "expenses_maintenance_request_id_fkey" FOREIGN KEY ("maintenance_request_id") REFERENCES "maintenance_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "room_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "request_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "estimated_cost" DECIMAL,
    "actual_cost" DECIMAL,
    "assigned_to" INTEGER,
    "reported_by" TEXT,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "maintenance_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "maintenance_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "owner_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER,
    "old_data" JSONB,
    "new_data" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "landlord_id" INTEGER NOT NULL,
    "property_id" INTEGER,
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_holder" TEXT NOT NULL,
    "branch" TEXT,
    "qr_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bank_accounts_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_accounts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "action_label" TEXT,
    "related_entity_type" TEXT,
    "related_entity_id" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dedupe_key" TEXT NOT NULL,
    "invoice_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "notification_type" TEXT NOT NULL,
    "scheduled_for" DATETIME NOT NULL,
    "sent_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "notification_id" INTEGER,
    CONSTRAINT "notification_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notification_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job_name" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stats" JSONB,
    "error" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);

-- CreateTable
CREATE TABLE "hunonic_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "landlord_id" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "password_enc" TEXT NOT NULL,
    "token_enc" TEXT,
    "auto_import" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" DATETIME,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "hunonic_accounts_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_key" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_landlord_id_idx" ON "users"("landlord_id");

-- CreateIndex
CREATE INDEX "properties_owner_id_idx" ON "properties"("owner_id");

-- CreateIndex
CREATE INDEX "services_property_id_idx" ON "services"("property_id");

-- CreateIndex
CREATE INDEX "rooms_status_idx" ON "rooms"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_room_number_key" ON "rooms"("property_id", "room_number");

-- CreateIndex
CREATE INDEX "room_images_room_id_idx" ON "room_images"("room_id");

-- CreateIndex
CREATE INDEX "tenants_owner_id_full_name_idx" ON "tenants"("owner_id", "full_name");

-- CreateIndex
CREATE INDEX "tenants_owner_id_phone_idx" ON "tenants"("owner_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_owner_id_id_number_key" ON "tenants"("owner_id", "id_number");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contract_number_key" ON "contracts"("contract_number");

-- CreateIndex
CREATE INDEX "contracts_room_id_status_idx" ON "contracts"("room_id", "status");

-- CreateIndex
CREATE INDEX "contracts_status_end_date_idx" ON "contracts"("status", "end_date");

-- CreateIndex
CREATE INDEX "contract_tenants_tenant_id_idx" ON "contract_tenants"("tenant_id");

-- CreateIndex
CREATE INDEX "meter_readings_period_idx" ON "meter_readings"("period");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_room_id_period_key" ON "meter_readings"("room_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_reference_key" ON "invoices"("payment_reference");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_period_idx" ON "invoices"("period");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_room_id_period_key_key" ON "invoices"("room_id", "period_key");

-- CreateIndex
CREATE INDEX "invoice_details_invoice_id_idx" ON "invoice_details"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_owner_id_type_name_key" ON "expense_categories"("owner_id", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_maintenance_request_id_key" ON "expenses"("maintenance_request_id");

-- CreateIndex
CREATE INDEX "expenses_property_id_entry_date_idx" ON "expenses"("property_id", "entry_date");

-- CreateIndex
CREATE INDEX "expenses_type_entry_date_idx" ON "expenses"("type", "entry_date");

-- CreateIndex
CREATE INDEX "maintenance_requests_status_idx" ON "maintenance_requests"("status");

-- CreateIndex
CREATE INDEX "maintenance_requests_room_id_idx" ON "maintenance_requests"("room_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_owner_id_created_at_idx" ON "audit_logs"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "bank_accounts_landlord_id_property_id_idx" ON "bank_accounts"("landlord_id", "property_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_type_created_at_idx" ON "notifications"("user_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_dedupe_key_key" ON "notification_logs"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_notification_id_key" ON "notification_logs"("notification_id");

-- CreateIndex
CREATE INDEX "notification_logs_invoice_id_idx" ON "notification_logs"("invoice_id");

-- CreateIndex
CREATE INDEX "job_runs_started_at_idx" ON "job_runs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_name_run_key_key" ON "job_runs"("job_name", "run_key");

-- CreateIndex
CREATE UNIQUE INDEX "hunonic_accounts_landlord_id_key" ON "hunonic_accounts"("landlord_id");


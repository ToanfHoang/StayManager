import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import './lib/validation';
import { authenticate, authorize } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { propertiesRouter, servicesRouter } from './modules/properties/properties.routes';
import { roomsRouter } from './modules/rooms/rooms.routes';
import { tenantsRouter } from './modules/tenants/tenants.routes';
import { contractsRouter } from './modules/contracts/contracts.routes';
import { metersRouter } from './modules/meters/meters.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { categoriesRouter, expensesRouter } from './modules/finance/finance.routes';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { bankRouter } from './modules/bank/bank.routes';
import { schedulerRouter } from './modules/scheduler/scheduler.routes';
import { hunonicRouter } from './modules/hunonic/hunonic.routes';
import { backupRouter } from './modules/backup/backup.routes';
import fs from 'fs';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: env.FRONTEND_DIST ? false : undefined }));
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: false }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { fallthrough: false, maxAge: '7d' }));

  app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(authenticate, authorize('ADMIN', 'LANDLORD', 'STAFF'));
  api.use('/notifications', notificationsRouter);
  api.use('/users', usersRouter);
  api.use('/properties', propertiesRouter);
  api.use('/services', servicesRouter);
  api.use('/rooms', roomsRouter);
  api.use('/tenants', tenantsRouter);
  api.use('/contracts', contractsRouter);
  api.use('/meter-readings', metersRouter);
  api.use('/invoices', invoicesRouter);
  api.use('/payments', paymentsRouter);
  api.use('/expenses', expensesRouter);
  api.use('/expense-categories', categoriesRouter);
  api.use('/maintenance-requests', maintenanceRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/reports', reportsRouter);
  api.use('/audit-logs', auditRouter);
  api.use('/bank-accounts', bankRouter);
  api.use('/admin/scheduler', schedulerRouter);
  api.use('/hunonic', hunonicRouter);
  api.use('/backup', backupRouter);
  app.use('/api', api);

  // Bản desktop: phục vụ giao diện đã build (SPA) từ cùng địa chỉ
  if (env.FRONTEND_DIST && fs.existsSync(path.join(env.FRONTEND_DIST, 'index.html'))) {
    const dist = path.resolve(env.FRONTEND_DIST);
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/uploads\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error';

import authRoutes from './modules/auth/auth.routes';
import schoolRoutes from './modules/schools/schools.routes';
import studentRoutes from './modules/students/students.routes';
import guardianRoutes from './modules/guardians/guardians.routes';
import teacherRoutes from './modules/teachers/teachers.routes';
import academicsRoutes from './modules/academics/academics.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import examRoutes from './modules/exams/exams.routes';
import financeRoutes from './modules/finance/finance.routes';
import announcementRoutes from './modules/announcements/announcements.routes';
import cmsRoutes, { publicRouter as publicCmsRoutes } from './modules/cms/cms.routes';
import adminRoutes from './modules/admin/admin.routes';
import supportRoutes from './modules/admin/support.routes';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nisms-api', time: new Date().toISOString() });
  });

  // Public school websites (no auth)
  app.use('/api/public', publicCmsRoutes);

  // Authentication & user management
  app.use('/api/auth', authRoutes);

  // Tenant (school) modules — all enforce auth + tenant + feature flags + RBAC
  app.use('/api/school', schoolRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/guardians', guardianRoutes);
  app.use('/api/teachers', teacherRoutes);
  app.use('/api/academics', academicsRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/announcements', announcementRoutes);
  app.use('/api/cms', cmsRoutes);

  // Natural Intellects Control Center (platform admins)
  app.use('/api/admin', adminRoutes);
  app.use('/api/support', supportRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
  app.use(errorHandler);

  return app;
}

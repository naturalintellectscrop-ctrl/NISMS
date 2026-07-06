/**
 * NISMS seed: platform super admin + one demo school (St. Mary's) with
 * a full set of role accounts, academic structure and sample records.
 * Run: npm run seed  (idempotent — safe to re-run)
 */
import 'dotenv/config';
import { PlanType, PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PLAN_FEATURES: Record<string, string[]> = {
  STARTER: ['STUDENTS', 'TEACHERS', 'ATTENDANCE', 'ACADEMICS', 'FEES', 'ANNOUNCEMENTS', 'WEBSITE'],
  PROFESSIONAL: ['STUDENTS', 'TEACHERS', 'ATTENDANCE', 'ACADEMICS', 'FEES', 'ANNOUNCEMENTS', 'WEBSITE', 'LIBRARY', 'SMS', 'PARENT_PORTAL', 'ADVANCED_REPORTS'],
  ENTERPRISE: ['STUDENTS', 'TEACHERS', 'ATTENDANCE', 'ACADEMICS', 'FEES', 'ANNOUNCEMENTS', 'WEBSITE', 'LIBRARY', 'SMS', 'PARENT_PORTAL', 'ADVANCED_REPORTS', 'INVENTORY', 'HOSTEL', 'ANALYTICS', 'API_ACCESS'],
};
const ALL_KEYS = PLAN_FEATURES.ENTERPRISE;

async function upsertUser(email: string, password: string, role: Role, firstName: string, lastName: string, schoolId: string | null) {
  return prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: await bcrypt.hash(password, 10), role, firstName, lastName, schoolId },
    update: { role, schoolId },
  });
}

async function main() {
  console.log('Seeding NISMS...');

  // 1. Platform admins
  await upsertUser('admin@naturalintellects.com', 'SuperAdmin@123', Role.SUPER_ADMIN, 'Natural', 'Intellects', null);
  await upsertUser('support@naturalintellects.com', 'Support@123', Role.SUPPORT_ADMIN, 'Support', 'Team', null);

  // 2. Demo school
  const school = await prisma.school.upsert({
    where: { shortName: 'st-marys' },
    create: {
      name: "St. Mary's School",
      shortName: 'st-marys',
      email: 'info@stmarys.ac.ug',
      phone: '+256700000001',
      address: 'Kampala, Uganda',
      status: 'ACTIVE',
      settings: { create: { motto: 'Knowledge is Light', currency: 'UGX' } },
    },
    update: {},
  });

  await prisma.subscription.upsert({
    where: { schoolId: school.id },
    create: { schoolId: school.id, planType: PlanType.PROFESSIONAL, renewalDate: new Date(Date.now() + 365 * 86400000), amount: 1_200_000 },
    update: {},
  });

  const enabled = new Set(PLAN_FEATURES.PROFESSIONAL);
  for (const featureKey of ALL_KEYS) {
    await prisma.schoolFeature.upsert({
      where: { schoolId_featureKey: { schoolId: school.id, featureKey } },
      create: { schoolId: school.id, featureKey, isEnabled: enabled.has(featureKey) },
      update: {},
    });
  }

  // 3. School role accounts
  await upsertUser('admin@stmarys.ac.ug', 'Admin@1234', Role.SCHOOL_ADMIN, 'Grace', 'Nakato', school.id);
  await upsertUser('proprietor@stmarys.ac.ug', 'Proprietor@123', Role.PROPRIETOR, 'John', 'Ssemakula', school.id);
  await upsertUser('headteacher@stmarys.ac.ug', 'HeadTeacher@123', Role.HEAD_TEACHER, 'Mary', 'Achieng', school.id);
  await upsertUser('secretary@stmarys.ac.ug', 'Secretary@123', Role.SECRETARY, 'Sarah', 'Namuli', school.id);
  await upsertUser('bursar@stmarys.ac.ug', 'Bursar@1234', Role.BURSAR, 'Peter', 'Okello', school.id);
  const teacherUser = await upsertUser('teacher@stmarys.ac.ug', 'Teacher@123', Role.TEACHER, 'David', 'Mugisha', school.id);

  // 4. Academic structure
  const classNames = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
  const classes: Record<string, string> = {};
  for (let i = 0; i < classNames.length; i++) {
    const cls = await prisma.class.upsert({
      where: { schoolId_name: { schoolId: school.id, name: classNames[i] } },
      create: { schoolId: school.id, name: classNames[i], level: i + 1 },
      update: {},
    });
    classes[classNames[i]] = cls.id;
  }

  for (const stream of ['Blue', 'Red']) {
    const classId = classes['P4'];
    const exists = await prisma.stream.findFirst({ where: { classId, name: stream } });
    if (!exists) await prisma.stream.create({ data: { schoolId: school.id, classId, name: stream } });
  }

  const subjectDefs: Array<[string, string, 'SCIENCE' | 'ART' | 'LANGUAGE' | 'OTHER']> = [
    ['English', 'ENG', 'LANGUAGE'],
    ['Mathematics', 'MTC', 'SCIENCE'],
    ['Science', 'SCI', 'SCIENCE'],
    ['Social Studies', 'SST', 'ART'],
  ];
  const subjects: Record<string, string> = {};
  for (const [name, code, category] of subjectDefs) {
    const subject = await prisma.subject.upsert({
      where: { schoolId_name: { schoolId: school.id, name } },
      create: { schoolId: school.id, name, code, category },
      update: {},
    });
    subjects[name] = subject.id;
  }

  const year = new Date().getFullYear();
  const term = await prisma.term.upsert({
    where: { schoolId_name_year: { schoolId: school.id, name: 'TERM_II', year } },
    create: { schoolId: school.id, name: 'TERM_II', year, startDate: new Date(`${year}-05-20`), endDate: new Date(`${year}-08-15`), isActive: true },
    update: { isActive: true },
  });

  // 5. Teacher profile + assignments
  const teacher = await prisma.teacher.upsert({
    where: { schoolId_staffNumber: { schoolId: school.id, staffNumber: 'STF-001' } },
    create: {
      schoolId: school.id,
      userId: teacherUser.id,
      staffNumber: 'STF-001',
      firstName: 'David',
      lastName: 'Mugisha',
      gender: 'MALE',
      phoneNumber: '+256700000010',
      email: 'teacher@stmarys.ac.ug',
    },
    update: {},
  });
  await prisma.teacherSubject.upsert({
    where: { teacherId_subjectId: { teacherId: teacher.id, subjectId: subjects['Mathematics'] } },
    create: { teacherId: teacher.id, subjectId: subjects['Mathematics'] },
    update: {},
  });
  const assignment = await prisma.teacherClass.findFirst({ where: { teacherId: teacher.id, classId: classes['P4'] } });
  if (!assignment) {
    await prisma.teacherClass.create({
      data: { teacherId: teacher.id, classId: classes['P4'], subjectId: subjects['Mathematics'], isClassTeacher: true },
    });
  }

  // 6. Students + guardian
  const studentDefs: Array<[string, string, string, 'MALE' | 'FEMALE']> = [
    ['STM-0001', 'Brian', 'Kato', 'MALE'],
    ['STM-0002', 'Alice', 'Namutebi', 'FEMALE'],
    ['STM-0003', 'Ivan', 'Lubega', 'MALE'],
  ];
  const studentIds: string[] = [];
  for (const [admissionNumber, firstName, lastName, gender] of studentDefs) {
    const student = await prisma.student.upsert({
      where: { schoolId_admissionNumber: { schoolId: school.id, admissionNumber } },
      create: {
        schoolId: school.id,
        admissionNumber,
        firstName,
        lastName,
        gender,
        dateOfBirth: new Date('2014-03-10'),
        classId: classes['P4'],
      },
      update: {},
    });
    studentIds.push(student.id);
  }

  let guardian = await prisma.guardian.findFirst({ where: { schoolId: school.id, phoneNumber: '+256700000020' } });
  if (!guardian) {
    guardian = await prisma.guardian.create({
      data: { schoolId: school.id, fullName: 'Robert Kato', phoneNumber: '+256700000020', relationship: 'Father', address: 'Kampala' },
    });
  }
  await prisma.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId: studentIds[0], guardianId: guardian.id } },
    create: { studentId: studentIds[0], guardianId: guardian.id, isPrimaryContact: true },
    update: {},
  });

  // 7. Fee structure + one payment
  await prisma.feeStructure.upsert({
    where: { schoolId_classId_termId: { schoolId: school.id, classId: classes['P4'], termId: term.id } },
    create: { schoolId: school.id, classId: classes['P4'], termId: term.id, amount: 450_000, description: 'P4 tuition' },
    update: {},
  });
  const existingPayment = await prisma.payment.findUnique({
    where: { schoolId_receiptNumber: { schoolId: school.id, receiptNumber: 'RCT-000001' } },
  });
  if (!existingPayment) {
    await prisma.payment.create({
      data: {
        schoolId: school.id,
        studentId: studentIds[0],
        amount: 200_000,
        paymentMethod: 'MOBILE_MONEY',
        referenceNumber: 'MM-778812',
        receiptNumber: 'RCT-000001',
      },
    });
  }

  console.log('Seed complete.');
  console.log('--- Login accounts ---');
  console.log('Platform: admin@naturalintellects.com / SuperAdmin@123');
  console.log('School admin: admin@stmarys.ac.ug / Admin@1234');
  console.log('Teacher: teacher@stmarys.ac.ug / Teacher@123');
  console.log('Bursar: bursar@stmarys.ac.ug / Bursar@1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

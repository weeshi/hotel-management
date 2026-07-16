import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 بدء إنشاء البيانات التجريبية...');

  // إنشاء الفندق
  const hotel = await prisma.hotel.upsert({
    where: { id: 'default-hotel' },
    update: {},
    create: {
      id: 'default-hotel',
      name: 'فندق السلام',
      nameAr: 'فندق السلام',
      address: 'طرابلس، ليبيا',
      phone: '+218-21-1234567',
      email: 'info@hotel-salam.ly',
      currency: 'LYD',
      checkInTime: '14:00',
      checkOutTime: '12:00',
    },
  });
  console.log(`✅ تم إنشاء الفندق: ${hotel.name}`);

  // إنشاء المستخدمين
  const adminPassword = await bcrypt.hash('admin123', 12);
  const receptionPassword = await bcrypt.hash('reception123', 12);
  const password123 = await bcrypt.hash('123456', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hotel.com' },
    update: {},
    create: {
      email: 'admin@hotel.com',
      password: adminPassword,
      name: 'مدير النظام',
      role: 'ADMIN',
      hotelId: hotel.id,
    },
  });
  console.log(`✅ تم إنشاء المدير: ${admin.email}`);

  await prisma.user.upsert({
    where: { email: 'reception@hotel.com' },
    update: {},
    create: {
      email: 'reception@hotel.com',
      password: receptionPassword,
      name: 'موظف الاستقبال',
      role: 'RECEPTION',
      hotelId: hotel.id,
    },
  });
  console.log(`✅ تم إنشاء موظف الاستقبال`);

  await prisma.user.upsert({
    where: { email: 'manager@hotel.com' },
    update: {},
    create: {
      email: 'manager@hotel.com',
      password: password123,
      name: 'مدير الفندق',
      role: 'MANAGER',
      hotelId: hotel.id,
    },
  });
  console.log(`✅ تم إنشاء مدير الفندق`);

  await prisma.user.upsert({
    where: { email: 'housekeeping@hotel.com' },
    update: {},
    create: {
      email: 'housekeeping@hotel.com',
      password: password123,
      name: 'موظف التدبير المنزلي',
      role: 'HOUSEKEEPING',
      hotelId: hotel.id,
    },
  });
  console.log(`✅ تم إنشاء موظف التدبير المنزلي`);

  await prisma.user.upsert({
    where: { email: 'maintenance@hotel.com' },
    update: {},
    create: {
      email: 'maintenance@hotel.com',
      password: password123,
      name: 'موظف الصيانة',
      role: 'MAINTENANCE',
      hotelId: hotel.id,
    },
  });
  console.log(`✅ تم إنشاء موظف الصيانة`);

  await prisma.user.upsert({
    where: { email: 'restaurant@hotel.com' },
    update: {},
    create: {
      email: 'restaurant@hotel.com',
      password: password123,
      name: 'موظف المطعم',
      role: 'RESTAURANT',
      hotelId: hotel.id,
    },
  });
  console.log(`✅ تم إنشاء موظف المطعم`);

  await prisma.user.upsert({
    where: { email: 'accountant@hotel.com' },
    update: {},
    create: {
      email: 'accountant@hotel.com',
      password: password123,
      name: 'المحاسب',
      role: 'ACCOUNTANT',
      hotelId: hotel.id,
    },
  });
  console.log(`✅ تم إنشاء المحاسب`);

  // إنشاء فئات الخدمات
  const foodCat = await prisma.serviceCategory.upsert({
    where: { id: 'cat-food' },
    update: { name: 'مطعم', nameAr: 'مطعم', icon: '🍽️', sortOrder: 1 },
    create: { id: 'cat-food', hotelId: hotel.id, name: 'مطعم', nameAr: 'مطعم', icon: '🍽️', sortOrder: 1 },
  });

  const cleaningCat = await prisma.serviceCategory.upsert({
    where: { id: 'cat-cleaning' },
    update: { name: 'تنظيف', nameAr: 'تنظيف', icon: '🧹', sortOrder: 2 },
    create: { id: 'cat-cleaning', hotelId: hotel.id, name: 'تنظيف', nameAr: 'تنظيف', icon: '🧹', sortOrder: 2 },
  });

  const transportCat = await prisma.serviceCategory.upsert({
    where: { id: 'cat-transport' },
    update: { name: 'نقل', nameAr: 'نقل', icon: '🚗', sortOrder: 3 },
    create: { id: 'cat-transport', hotelId: hotel.id, name: 'نقل', nameAr: 'نقل', icon: '🚗', sortOrder: 3 },
  });

  // إنشاء الخدمات
  const services = [
    { id: 'svc-breakfast', categoryId: foodCat.id, name: 'فطور', nameAr: 'فطور', price: 50 },
    { id: 'svc-lunch', categoryId: foodCat.id, name: 'غداء', nameAr: 'غداء', price: 80 },
    { id: 'svc-dinner', categoryId: foodCat.id, name: 'عشاء', nameAr: 'عشاء', price: 100 },
    { id: 'svc-room-cleaning', categoryId: cleaningCat.id, name: 'تنظيف الغرفة', nameAr: 'تنظيف الغرفة', price: 30 },
    { id: 'svc-dry-cleaning', categoryId: cleaningCat.id, name: 'تنظيف جاف', nameAr: 'تنظيف جاف', price: 50 },
    { id: 'svc-airport-oneway', categoryId: transportCat.id, name: 'نقل مطار (ذهاب)', nameAr: 'نقل مطار (ذهاب)', price: 120 },
    { id: 'svc-airport-roundtrip', categoryId: transportCat.id, name: 'نقل مطار (ذهاب وعودة)', nameAr: 'نقل مطار (ذهاب وعودة)', price: 200 },
  ];
  for (const svc of services) {
    await prisma.service.upsert({
      where: { id: svc.id },
      update: { name: svc.name, nameAr: svc.nameAr, price: svc.price },
      create: { ...svc, hotelId: hotel.id },
    });
  }
  console.log('✅ تم إنشاء الخدمات');

  // إنشاء أنواع الغرف
  const singleRoom = await prisma.roomType.upsert({
    where: { id: 'room-type-single' },
    update: {},
    create: {
      id: 'room-type-single',
      hotelId: hotel.id,
      name: 'غرفة مفردة',
      nameAr: 'غرفة مفردة',
      description: 'غرفة مريحة بسرير واحد',
      baseRate: 250,
      capacity: 1,
      amenityServices: { create: [{ serviceId: 'svc-breakfast' }, { serviceId: 'svc-room-cleaning' }] },
    },
  });

  const doubleRoom = await prisma.roomType.upsert({
    where: { id: 'room-type-double' },
    update: {},
    create: {
      id: 'room-type-double',
      hotelId: hotel.id,
      name: 'غرفة مزدوجة',
      nameAr: 'غرفة مزدوجة',
      description: 'غرفة واسعة بسريرين',
      baseRate: 350,
      capacity: 2,
      amenityServices: { create: [{ serviceId: 'svc-breakfast' }, { serviceId: 'svc-room-cleaning' }, { serviceId: 'svc-dry-cleaning' }] },
    },
  });

  const suiteRoom = await prisma.roomType.upsert({
    where: { id: 'room-type-suite' },
    update: {},
    create: {
      id: 'room-type-suite',
      hotelId: hotel.id,
      name: 'جناح',
      nameAr: 'جناح',
      description: 'جناح فاخر مع غرفة معيشة',
      baseRate: 550,
      capacity: 4,
      amenityServices: { create: [{ serviceId: 'svc-breakfast' }, { serviceId: 'svc-lunch' }, { serviceId: 'svc-dinner' }, { serviceId: 'svc-room-cleaning' }, { serviceId: 'svc-dry-cleaning' }] },
    },
  });
  console.log(`✅ تم إنشاء 3 أنواع غرف`);

  // إنشاء الغرف
  const rooms = [];
  for (let floor = 1; floor <= 3; floor++) {
    for (let i = 1; i <= 8; i++) {
      const roomNumber = `${floor}0${i}`;
      const type = i <= 3 ? singleRoom : i <= 6 ? doubleRoom : suiteRoom;
      rooms.push({
        hotelId: hotel.id,
        roomNumber,
        floor,
        roomTypeId: type.id,
        status: 'AVAILABLE' as const,
      });
    }
  }

  for (const room of rooms) {
    await prisma.room.upsert({
      where: {
        hotelId_roomNumber: {
          hotelId: room.hotelId,
          roomNumber: room.roomNumber,
        },
      },
      update: {},
      create: room,
    });
  }
  console.log(`✅ تم إنشاء ${rooms.length} غرفة`);

  // إنشاء سياسات إلغاء
  await prisma.cancellationPolicy.createMany({
    data: [
      {
        hotelId: hotel.id,
        name: 'مرنة',
        nameAr: 'مرنة',
        rules: JSON.stringify([
          { hoursBefore: 48, refundPercent: 100 },
          { hoursBefore: 24, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 0 },
        ]),
      },
      {
        hotelId: hotel.id,
        name: 'معتدلة',
        nameAr: 'معتدلة',
        rules: JSON.stringify([
          { hoursBefore: 72, refundPercent: 100 },
          { hoursBefore: 48, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 25 },
        ]),
      },
      {
        hotelId: hotel.id,
        name: 'صارمة',
        nameAr: 'صارمة',
        rules: JSON.stringify([
          { hoursBefore: 168, refundPercent: 100 },
          { hoursBefore: 72, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 0 },
        ]),
      },
    ],
  });
  console.log('✅ تم إنشاء سياسات الإلغاء');

  // إنشاء أنواع المهام
  const taskTypes = [
    { id: 'tt-cleaning', name: 'CLEANING', nameAr: 'تنظيف', icon: '🧹', sortOrder: 1 },
    { id: 'tt-maintenance', name: 'MAINTENANCE', nameAr: 'صيانة', icon: '🔧', sortOrder: 2 },
    { id: 'tt-inspection', name: 'INSPECTION', nameAr: 'تفتيش', icon: '🔍', sortOrder: 3 },
    { id: 'tt-laundry', name: 'LAUNDRY', nameAr: 'غسيل', icon: '👕', sortOrder: 4 },
    { id: 'tt-minibar', name: 'MINIBAR', nameAr: 'ميني بار', icon: '🥤', sortOrder: 5 },
    { id: 'tt-other', name: 'OTHER', nameAr: 'أخرى', icon: '📋', sortOrder: 6 },
  ];
  for (const tt of taskTypes) {
    await prisma.taskType.upsert({
      where: { id: tt.id },
      update: { name: tt.name, nameAr: tt.nameAr, icon: tt.icon, sortOrder: tt.sortOrder },
      create: { ...tt, hotelId: hotel.id },
    });
  }
  console.log('✅ تم إنشاء أنواع المهام');

  console.log('\n🎉 تم إنشاء جميع البيانات التجريبية بنجاح!');
  console.log('\n📧 حسابات الاختبار:');
  console.log('   admin@hotel.com        / admin123    (مدير النظام)');
  console.log('   manager@hotel.com      / 123456      (مدير الفندق)');
  console.log('   reception@hotel.com    / reception123 (موظف الاستقبال)');
  console.log('   housekeeping@hotel.com / 123456      (التدبير المنزلي)');
  console.log('   maintenance@hotel.com  / 123456      (الصيانة)');
  console.log('   restaurant@hotel.com   / 123456      (المطعم)');
  console.log('   accountant@hotel.com   / 123456      (المحاسب)');
}

main()
  .catch((e) => {
    console.error('❌ خطأ:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

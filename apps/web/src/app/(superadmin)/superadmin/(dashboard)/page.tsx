import { SignOutButton } from './sign-out-button';

export default function SuperAdminOverviewPage() {
  return (
    <div>
      <h1 data-testid="superadmin-welcome" className="text-2xl font-bold mb-6">
        أهلاً بك في لوحة التحكم العليا
      </h1>

      <div className="card max-w-2xl">
        <div className="text-3xl mb-3">👑</div>
        <h2 className="text-lg font-bold mb-2">نظرة عامة</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          هذه شاشة الترحيب الافتتاحية للوحة التحكم العليا. من القائمة الجانبية يمكنك
          إدارة فنادق المنصة ومراجعة دعوات الانضمام ومراقبة طوابير المعالجة. يتم الآن
          الدخول عبر المصادقة الثنائية (2FA) بالبريد الإلكتروني — وجلسة التحقق مشفرة
          بعلامة <span className="font-semibold text-[var(--gold)]">tf: verified</span>.
        </p>
        <div className="mt-6 flex justify-end">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
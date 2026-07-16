import Link from 'next/link';

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-red-500">403</h1>
        <p className="mt-4 text-xl text-gray-600">ليس لديك صلاحية الوصول إلى هذه الصفحة</p>
        <p className="mt-2 text-gray-500">Access Denied — You do not have permission to view this page.</p>
        <Link
          href="/auth/login"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          العودة إلى تسجيل الدخول
        </Link>
      </div>
    </div>
  );
}

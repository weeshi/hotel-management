import Link from 'next/link';

export default function PublicHomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4">
      <section className="py-16 md:py-24 text-center">
        <div className="inline-block px-4 py-1.5 rounded-full border border-[var(--border-gold)] text-[var(--gold)] text-sm font-semibold mb-6 bg-[rgba(201,168,76,0.08)]">
          🏨 فندق السلام
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
          تجربة <span className="text-[var(--gold)]">إقامة</span> لا تُنسى
        </h1>
        <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-2xl mx-auto">
          استمتع بأفضل خدمات الضيافة في طرابلس. غرف مريحة، خدمات متكاملة، وأسعار تنافسية.
        </p>
        <Link
          href="/rooms"
          className="inline-block px-8 py-3 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 transition-all"
        >
          استعرض الغرف
        </Link>
      </section>

      <section className="py-12">
        <h2 className="text-2xl font-bold text-center mb-8">لماذا تختار فندق السلام؟</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: '🛏️', title: 'غرف مريحة', desc: 'غرف مجهزة بأحدث الوسائل لراحة نزلاءنا' },
            { icon: '🌐', title: 'حجز إلكتروني', desc: 'نظام حجز متطور يتيح لك الحجز بسهولة' },
            { icon: '💳', title: 'دفع آمن', desc: 'بوابات دفع متعددة ومشفرة بالكامل' },
          ].map((item) => (
            <div key={item.title} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 text-center hover:border-[var(--border-gold)] transition-all">
              <div className="text-4xl mb-4">{item.icon}</div>
              <h3 className="text-lg font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

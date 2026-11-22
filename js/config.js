// إعدادات الموقع — عدّلها حسب مشروعك
export const CONFIG = {
  brand: 'طبعة 3D',
  // رقم واتساب لاستقبال الطلبات بالصيغة الدولية بدون + أو أصفار (مثال: 97455555555)
  // إذا تركته فارغاً، زر الطلب يفتح واتساب ويختار الزبون جهة الإرسال
  whatsapp: '',
  currency: 'ر.ق',
  filamentPricePerKg: 90,   // سعر كيلو الفلامنت
  profitMultiplier: 3,      // معامل الربح المقترح لسعر البيع
  minPrice: 10,             // أقل سعر للقطعة
  density: 1.24,            // كثافة PLA غ/سم³
  infill: 0.8,              // نسبة الخامة الفعلية من الحجم (تعبئة جزئية)
  hourlyRate: 4,            // أجرة ساعة الطابعة/التشغيل
  printBaseMin: 6,          // دقائق ثابتة لكل قطعة (تجهيز + أول طبقات)
  printMinPerGram: 4.2,     // دقائق طباعة لكل جرام
  roundTo: 1,               // تقريب السعر لأعلى لأقرب (1 / 5 / 10…)
  // خصومات الجملة: من كمية معينة وفوق
  // الهوية: مسار صورة الشعار (مثلاً 'icons/logo.png') ولون التمييز. اتركها فارغة للافتراضي
  logo: '',
  accent: '',
  // صفحة «من نحن» — اترك أي حقل فارغ ليختفي
  about: {
    text: 'نصمّم ونطبع مجسمات ثلاثية الأبعاد حسب الطلب: ميداليات بأسماء الكوفيهات وشعاراتها، توزيعات المناسبات، ليثوفين الصور، والهدايا الخاصة.\nكل قطعة نطبعها بعناية ونراجع تصميمها قبل الطباعة.',
    textEn: 'We design and 3D-print custom pieces: keychains with café names and logos, event giveaways, photo lithophanes and personal gifts.\nEvery design is reviewed before printing.',
    instagram: '',     // مثال: 'kkhatab3d'
    location: '',      // مثال: 'الدوحة، قطر'
    hours: '',         // مثال: 'يومياً 4م – 11م'
    email: '',
  },
  // باقة الكوفيهات: السعر التقريبي لكل قطعة (عدّلها حسب أسعارك)
  cafePackage: [
    { key: 'cup3d', label: 'ميدالية كوب 3D بالألوان', icon: '🥤', price: 18, qty: 20, go: 'cup3d' },
    { key: 'keychain', label: 'ميدالية مسطحة بالشعار', icon: '🏷️', price: 10, qty: 30, go: 'keychain' },
    { key: 'stand', label: 'ستاند QR للطاولة', icon: '🪧', price: 25, qty: 6, go: 'keychain' },
    { key: 'coaster', label: 'مسند أكواب', icon: '⭕', price: 15, qty: 12, go: 'keychain' },
  ],
  // ألوان الفلامنت المتوفرة عندك — الزبون يختار منها فقط. اجعل limitColors: false للسماح بأي لون
  limitColors: true,
  filaments: [
    { name: 'أبيض', hex: '#ffffff' }, { name: 'أسود', hex: '#1a1a1a' }, { name: 'رمادي', hex: '#8c8c8c' }, { name: 'فضي', hex: '#c0c0c0' },
    { name: 'ذهبي', hex: '#d4a017' }, { name: 'بيج', hex: '#f1e6cf' }, { name: 'بني فاتح', hex: '#a87b56' }, { name: 'بني', hex: '#6b4226' },
    { name: 'بني غامق', hex: '#3a2a22' }, { name: 'أحمر', hex: '#c62828' }, { name: 'عنابي', hex: '#8a1538' }, { name: 'وردي', hex: '#f4a7b9' },
    { name: 'برتقالي', hex: '#f57c00' }, { name: 'أصفر', hex: '#fbc02d' }, { name: 'أخضر', hex: '#2e7d32' }, { name: 'أخضر غامق', hex: '#1e4d3a' },
    { name: 'أزرق', hex: '#1565c0' }, { name: 'كحلي', hex: '#1d2b53' }, { name: 'سماوي', hex: '#4fc3f7' }, { name: 'بنفسجي', hex: '#6a1b9a' },
  ],
  tiers: [
    { min: 1, off: 0 },
    { min: 10, off: 10 },
    { min: 25, off: 15 },
    { min: 50, off: 20 },
    { min: 100, off: 30 },
  ],
};

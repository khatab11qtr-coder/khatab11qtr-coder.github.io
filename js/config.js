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
  tiers: [
    { min: 1, off: 0 },
    { min: 10, off: 10 },
    { min: 25, off: 15 },
    { min: 50, off: 20 },
    { min: 100, off: 30 },
  ],
};

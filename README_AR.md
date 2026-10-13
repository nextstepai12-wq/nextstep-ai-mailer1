# مركز المراسلات — NextStep AI

إعداد: م. أحمد وسام الحايك — مؤسس NextStep

## محتويات المجلد

| الملف | وظيفته |
|---|---|
| `mailer.html` | واجهة الإدارة (تسجيل دخول، مستلمون، محرر، معاينة، إرسال، سجل) |
| `assets/nextstep-seal.png` | الختم الرسمي بخلفية خارجية شفافة |
| `supabase/schema.sql` | الجداول وصلاحيات الأمان (RLS) |
| `supabase/functions/send-mail/index.ts` | دالة الإرسال عبر SMTP |

## كيف يعمل النظام

المتصفح (GitHub Pages) → تسجيل دخول Supabase Auth → دالة `send-mail` تتحقق أنك مشرف → ترسل عبر SMTP.
بيانات SMTP تُحفظ في أسرار Supabase فقط، ولا تظهر في الصفحة أو في GitHub.

## خطوات الإعداد

### 1) قاعدة البيانات
1. افتح مشروع Supabase ← **SQL Editor**.
2. الصق محتوى `supabase/schema.sql` كاملاً وشغّله.

### 2) حساب المشرف
1. **Authentication ← Users ← Add user**: أنشئ مستخدماً ببريدك وكلمة مرور قوية.
2. في SQL Editor شغّل (ببريدك بأحرف صغيرة):
   ```sql
   insert into public.admins (email) values ('your-email@example.com');
   ```
3. **Authentication ← Sign In / Providers**: عطّل «Allow new users to sign up» حتى لا يسجّل أحد حساباً جديداً.
   (حتى لو سجّل، لن يستطيع القراءة أو الإرسال لأنه ليس في جدول `admins`.)
4. **Authentication ← URL Configuration**: أضف رابط موقعك على GitHub Pages ضمن Redirect URLs (لاستعادة كلمة المرور).

### 3) خدمة SMTP
اختر مزوداً (أمثلة: Gmail بكلمة مرور تطبيق، Zoho، Brevo، Mailgun، أو SMTP نطاقك).
بالنسبة لـ Gmail: فعّل التحقق بخطوتين ثم أنشئ «App password»، والمنفذ `465`.

ثبّت Supabase CLI ثم من جذر المشروع:

```bash
supabase login
supabase link --project-ref gtpdvlibwtgakjlkjfdx

supabase secrets set \
  SMTP_HOST=smtp.gmail.com \
  SMTP_PORT=465 \
  SMTP_USER=your-address@gmail.com \
  SMTP_PASS="your-app-password" \
  SMTP_FROM_EMAIL=your-address@gmail.com \
  SMTP_FROM_NAME="NextStep AI" \
  DAILY_LIMIT=400

supabase functions deploy send-mail
```

- استخدم المنفذ `465` (اتصال مشفّر مباشر). إن اضطررت لـ `587` فجرّب أولاً بالنسخة التجريبية.
- `DAILY_LIMIT` حد أمان يومي من جهتنا. اجعله أقل من حد مزوّدك (Gmail المجاني نحو 500 يومياً).
- اختياري: `SMTP_REPLY_TO` لعنوان الرد.

### 4) النشر على GitHub
ارفع المجلد كما هو (أو ضع `mailer.html` و`assets/nextstep-seal.png` بجانب موقعك الحالي)، ثم فعّل GitHub Pages.
الصفحة تحتوي على `noindex`، ولا تضع رابطها في الموقع العام.

### 5) أول استخدام
1. افتح `mailer.html` وسجّل الدخول.
2. من **إعدادات** ضع رابط الشعار الكامل (مثل `https://USERNAME.github.io/REPO/assets/nextstep-seal.png`) ليظهر داخل البريد.
3. اضغط **فحص اتصال SMTP**: يجب أن تظهر الشارة بالأخضر مع المتبقي من حصة اليوم.
4. أبقِ **الوضع التجريبي** مفعّلاً وجرّب الواجهة، ثم عطّله وأرسل **نسخة تجريبية لك** قبل أي حملة.

## استيراد جدول موجود (اختياري)
في تبويب «قاعدة البيانات» اكتب اسم الجدول وعمودَي الاسم والبريد. ولكي يقرأ المشرف الجدول شغّل (بعد تعديل الاسم):

```sql
alter table public.team_applications enable row level security;
create policy "admins read team_applications" on public.team_applications
  for select to authenticated using (public.is_admin());
```
تنبيه: إن كان هذا الجدول تكتب فيه صفحة عامة (مثل نموذج الانضمام)، فتفعيل RLS يتطلب أن تكون لديك سياسة إدخال للزوار مسبقاً، وإلا ستتوقف الصفحة العامة عن الحفظ. راجع سياساته الحالية قبل التفعيل.

## الأمان
- أي شخص لا يملك حساب مشرف لا يقرأ ولا يرسل (RLS + فحص الدالة).
- مفتاح `anon` في الصفحة مفتاح عام مصمم للظهور، وهو لا يعطي صلاحية دون تسجيل الدخول.
- لا تضع مفتاح `service_role` أو كلمة مرور SMTP في أي ملف على GitHub.

## ملاحظات إرسال مهمة
- راسل من وافقوا على التواصل فقط. زر 🚫 بجانب كل مستلم محفوظ يوقف مراسلته نهائياً.
- للنطاق الخاص: اضبط سجلات SPF وDKIM وDMARC عند مزوّد البريد لتقليل الوصول إلى البريد المزعج.
- ابدأ بدفعات صغيرة، وزِد تدريجياً.
- إن كانت بيانات الطلاب تخضع لقانون حماية البيانات الفلسطيني، فراجع محامياً مختصاً بشأن استخدام بريدهم في المراسلات.

## استكشاف الأخطاء
| العَرَض | الحل |
|---|---|
| «هذا الحساب ليس ضمن قائمة المشرفين» | تأكد من إدراج بريدك (بأحرف صغيرة) في جدول `admins` |
| «تعذّر الاتصال بالدالة» | تأكد من نشر `send-mail` ومن اسمها في الإعدادات |
| «SMTP غير مهيأ» | أعد تنفيذ `supabase secrets set` ثم أعد النشر |
| فشل الإرسال | افحص المنفذ وكلمة مرور التطبيق، وراجع Logs للدالة في لوحة Supabase |
| لا يظهر الشعار في البريد | ضع الرابط الكامل للشعار في الإعدادات |

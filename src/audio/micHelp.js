// What to tell the player about the microphone on this device (plan-phone-mode §2.1, §10.1).
// dev: the mode object ({ mode, device }) from platform/mode.js.
const isIos = (dev) => dev && (dev.device === 'iPhone' || dev.device === 'iPad');
const isAndroid = (dev) => dev && dev.device === 'Android';

// The permission was refused: where to turn it back on
export function deniedHelp(dev) {
  if (isIos(dev)) return 'Мікрофон заборонено. Safari: натисни «аА» ліворуч в адресному рядку → «Параметри вебсайту» → «Мікрофон» → «Дозволити», потім онови сторінку. '
    + 'Якщо граєш з іконки на початковому екрані: Параметри iPhone → Safari → Мікрофон → Дозволити. Або грай без мікрофона (галочка).';
  if (isAndroid(dev)) return 'Мікрофон заборонено. Chrome: натисни значок ліворуч від адреси → «Дозволи» → «Мікрофон» → «Дозволити», потім онови сторінку. '
    + 'Якщо Chrome сам не має доступу: Налаштування Android → Застосунки → Chrome → Дозволи → Мікрофон → Дозволити. Або грай без мікрофона (галочка).';
  return 'Мікрофон заборонено. У браузері: значок ліворуч від адреси → дозволи сайту → Мікрофон → Дозволити, потім онови сторінку. Або грай без мікрофона (галочка).';
}

// Before asking: what the dialogs will look like
export function promptHelp(dev) {
  if (isIos(dev)) return 'Safari може питати дозвіл при кожному відкритті сторінки — це нормально, калібрування збережеться. Щоб не питав: «аА» → «Параметри вебсайту» → «Мікрофон» → «Дозволити».';
  if (isAndroid(dev)) return 'Може бути два запити: спершу Android — дозвіл для Chrome, потім Chrome — для сайту. Обери «Дозволити під час відвідування» (з «Лише цього разу» спитає знову наступного разу).';
  return '';
}

// How to hold the phone while calibrating
export const HOLD_TEXT = 'Калібруй так, як гратимеш: телефон горизонтально в обох руках, на звичній відстані (30–40 см), нижній край з мікрофоном не закривай. '
  + 'Найкраще — у навушниках: тоді звуки гри не потрапляють у мікрофон. Калібрування має 5 кроків: тиша, звуки гри (мовчи), шепіт, голос, крик.';

// iPhone: the side switch silences web audio
export const IOS_SOUND = 'Не чути звуків гри? Перемикач «Без звуку» збоку iPhone: пересунь так, щоб не було видно помаранчевого, і додай гучність. Перевір кнопкою «Перевірити звук».';

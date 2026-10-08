// Contracts in this house (game/contracts.js).
// Units: metres, seconds, m/s (see src/config/index.js).

// ---------- contracts in this house (game/contracts.js) ----------
// goal: sum (deliver at least $sum) | item (deliver this item); noAlarm / noShout: extra conditions.
// bonus (2nd star): clean = no full alarm and no shout; intact = nothing damaged or broken.
// 3rd star: goal + bonus on the hard difficulty. mods override round / guard numbers.
export const contracts = [
  { id: 'first', name: 'Перша справа', brief: 'Винеси щонайменше $2,000. Будь-що.', goal: { sum: 2000 }, bonus: 'clean' },
  { id: 'clock', name: 'Замовлення: годинник', brief: 'Клієнт хоче лише годинник з каміна у вітальні. Решта не рахується.', goal: { item: 'clock' }, bonus: 'clean' },
  { id: 'quiet', name: 'Без тривоги', brief: '$1,500 так, щоб будинок жодного разу не підняв тривогу.', goal: { sum: 1500, noAlarm: true }, bonus: 'intact' },
  { id: 'silent', name: 'Ні звуку', brief: '$1,500 без жодного крику. Причаєний сьогодні неспокійний.', goal: { sum: 1500, noShout: true }, bonus: 'intact', mods: { lurkerCooldown: 20 }, needsMic: true },
  { id: 'rush', name: 'На час', brief: '$2,500 за 3 хвилини. Перші 60 с сторож п\'є чай.', goal: { sum: 2500 }, bonus: 'clean', mods: { time: 180, warnAt: 150, escapeTime: 45, teaAtStart: 60 } },
];

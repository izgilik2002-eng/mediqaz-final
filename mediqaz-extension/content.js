// ============================================================
// content.js — MediQaz Автозаполнитель форм 1С МИС v2.1
// Снайперский точечный ввод: Прием + Продолжительность + Содержание
// Инжектируется динамически через background.js
// ============================================================

// ─── Защита от повторной инжекции ───────────────────────────
if (window.__mediqazContentLoaded) {
  // Уже загружен
} else {
  window.__mediqazContentLoaded = true;

// ─── Слушаем сообщения от background.js ─────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FILL_FORM_DATA') {
    fillMISForm(message.medCard, message.duration)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ════════════════════════════════════════════════════════════
// ПОИСК ПОЛЕЙ ПО ЛЕЙБЛУ
// ════════════════════════════════════════════════════════════

function normalizeLabel(text) {
  return text.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

/**
 * findInputByExactLabel(labelText) — находит поле ввода по соседнему текстовому лейблу.
 * Заточен под веб-клиент 1С:Предприятие.
 */
function findInputByExactLabel(labelText) {
  const normalTarget = normalizeLabel(labelText);
  const candidates = document.querySelectorAll('span, div, td, label, th, p');

  for (const candidate of candidates) {
    const directText = Array.from(candidate.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent)
      .join('');

    if (normalizeLabel(directText) !== normalTarget) continue;

    const inputSelector = 'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled])';

    // a) nextElementSibling
    let sibling = candidate.nextElementSibling;
    while (sibling) {
      if (sibling.matches(inputSelector) && isVisible(sibling)) return sibling;
      const inner = sibling.querySelector(inputSelector);
      if (inner && isVisible(inner)) return inner;
      sibling = sibling.nextElementSibling;
    }

    // b) parentElement
    const parent = candidate.parentElement;
    if (parent) {
      const inParent = parent.querySelector(inputSelector);
      if (inParent && inParent !== candidate && isVisible(inParent)) return inParent;
    }

    // c) closest('tr') — табличная разметка 1С
    const row = candidate.closest('tr');
    if (row) {
      const inRow = row.querySelector(inputSelector);
      if (inRow && isVisible(inRow)) return inRow;
    }

    // d) closest('div[class]') — div-контейнер 1С
    const container = candidate.closest('div[class]');
    if (container) {
      const inContainer = container.querySelector(inputSelector);
      if (inContainer && inContainer !== candidate && isVisible(inContainer)) return inContainer;
    }
  }

  return null;
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 5 || rect.height < 5) return false;
  if (el.type === 'hidden') return false;
  if (el.disabled || el.readOnly) return false;
  return true;
}

// ════════════════════════════════════════════════════════════
// ПОИСК БОЛЬШОГО РЕДАКТОРА ДЛЯ "СОДЕРЖАНИЕ"
// ════════════════════════════════════════════════════════════

function findLargestEditor() {
  const candidates = [];

  document.querySelectorAll('iframe').forEach(iframe => {
    const rect = iframe.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 10000) {
      candidates.push({ el: iframe, type: 'iframe', area });
    }
  });

  document.querySelectorAll('textarea:not([disabled]):not([readonly])').forEach(ta => {
    const rect = ta.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 10000 && isVisible(ta)) {
      candidates.push({ el: ta, type: 'textarea', area });
    }
  });

  document.querySelectorAll('[contenteditable="true"]').forEach(ce => {
    const rect = ce.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 10000 && ce.offsetParent !== null) {
      candidates.push({ el: ce, type: 'contenteditable', area });
    }
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.area - a.area);
  return candidates[0];
}

// ════════════════════════════════════════════════════════════
// ЗАПОЛНЕНИЕ 1С COMBO BOX (Прием: Первичный/Повторный)
// ════════════════════════════════════════════════════════════

/**
 * fill1CComboBox(inputEl, value) — специально для кастомных дропдаунов 1С.
 *
 * Алгоритм:
 * 1. Вставляем текст в инпут и генерируем события → 1С раскрывает выпадающий список
 * 2. Ждём 400мс пока появятся опции
 * 3. Ищем в DOM элемент с нужным текстом (div/li/span с текстом "Первичный" или "Повторный")
 * 4. Кликаем на него → 1С подтверждает выбор
 * 5. Fallback: если опция не нашлась — просто оставляем вставленный текст
 */
async function fill1CComboBox(inputEl, value) {
  try {
    inputEl.focus();
    inputEl.dispatchEvent(new Event('focus', { bubbles: true }));

    // Вставляем значение через нативный сеттер (обход 1С-хуков)
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(inputEl, value);
    } else {
      inputEl.value = value;
    }

    // Генерируем события чтобы 1С увидел изменение и раскрыл список
    inputEl.dispatchEvent(new Event('keydown',  { bubbles: true }));
    inputEl.dispatchEvent(new Event('input',    { bubbles: true }));
    inputEl.dispatchEvent(new Event('change',   { bubbles: true }));

    // Ждём пока 1С раскроет выпадающий список
    await delay(450);

    // Ищем опцию в выпадающем списке по тексту
    const clicked = tryClickDropdownOption(value);

    if (clicked) {
      console.log(`[MediQaz] ✅ Клик по опции дропдауна: "${value}"`);
    } else {
      // Fallback: дропдаун не нашёлся — нажимаем Enter чтобы подтвердить введённый текст
      console.log(`[MediQaz] ℹ️ Опция дропдауна не найдена, подтверждаем Enter`);
      inputEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      }));
    }

    inputEl.blur();
    inputEl.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  } catch (err) {
    console.error('[MediQaz] Ошибка fill1CComboBox:', err);
    return false;
  }
}

/**
 * tryClickDropdownOption(value) — ищет и кликает по нужному пункту выпадающего 1С-списка.
 * 1С рендерит список опций как отдельные div/span/li с текстом, часто вне основного дерева.
 * @returns {boolean} — нашёл и кликнул ли
 */
function tryClickDropdownOption(value) {
  const normalValue = value.toLowerCase().trim();

  // 1С рендерит опции как элементы в popup/overlay контейнерах
  const optionCandidates = document.querySelectorAll(
    'div[class*="dropdown"] *, div[class*="popup"] *, div[class*="list"] *, ' +
    'div[class*="menu"] *, li, [role="option"], [role="listitem"]'
  );

  for (const el of optionCandidates) {
    const text = el.textContent?.trim().toLowerCase();
    if (text === normalValue) {
      el.click();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
      return true;
    }
  }

  // Второй проход — более широкий поиск: любой видимый элемент с точным текстом
  const allElements = document.querySelectorAll('div, span, li, td');
  for (const el of allElements) {
    if (!isVisible(el)) continue;
    const direct = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim().toLowerCase())
      .join('');
    if (direct === normalValue) {
      el.click();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
      return true;
    }
  }

  return false;
}

// ════════════════════════════════════════════════════════════
// УСТАНОВКА ЗНАЧЕНИЙ В 1С — эмуляция событий
// ════════════════════════════════════════════════════════════

function set1CValue(element, value) {
  try {
    element.focus();
    element.dispatchEvent(new Event('focus', { bubbles: true }));

    if (element.tagName === 'IFRAME') {
      const doc = element.contentDocument || element.contentWindow?.document;
      if (!doc) return false;
      const body = doc.body;
      if (!body) return false;
      body.focus();
      body.innerHTML = value.replace(/\n/g, '<br>');
      body.dispatchEvent(new Event('input',  { bubbles: true }));
      body.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (element.isContentEditable) {
      element.innerHTML = '';
      element.innerHTML = value.replace(/\n/g, '<br>');
      element.dispatchEvent(new Event('keydown', { bubbles: true }));
      element.dispatchEvent(new Event('input',   { bubbles: true }));
      element.dispatchEvent(new Event('change',  { bubbles: true }));
      element.blur();
      return true;
    }

    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    if (element.tagName === 'TEXTAREA' && nativeTextareaSetter) {
      nativeTextareaSetter.call(element, value);
    } else if (element.tagName === 'INPUT' && nativeInputSetter) {
      nativeInputSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('keydown', { bubbles: true }));
    element.dispatchEvent(new Event('input',   { bubbles: true }));
    element.dispatchEvent(new Event('change',  { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true,
    }));
    element.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true,
    }));

    element.blur();
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  } catch (err) {
    console.error('[MediQaz] Ошибка set1CValue:', err, element);
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// ПОДСВЕТКА ЗАПОЛНЕННОГО ПОЛЯ
// ════════════════════════════════════════════════════════════

function highlightField(el) {
  const originalBorder     = el.style.border;
  const originalBoxShadow  = el.style.boxShadow;
  const originalTransition = el.style.transition;

  el.style.transition = 'border 0.3s, box-shadow 0.3s';
  el.style.border     = '2px solid #059669';
  el.style.boxShadow  = '0 0 0 3px rgba(5, 150, 105, 0.2)';

  setTimeout(() => {
    el.style.border     = originalBorder;
    el.style.boxShadow  = originalBoxShadow;
    el.style.transition = originalTransition;
  }, 2500);
}

// ════════════════════════════════════════════════════════════
// ФОРМИРОВАНИЕ ТЕКСТА "СОДЕРЖАНИЕ"
// ════════════════════════════════════════════════════════════

function buildContentText(medCard) {
  const SECTIONS = [
    { key: 'жалобы',      label: 'Жалобы',      fallback: 'Жалоб нет' },
    { key: 'анамнез',     label: 'Анамнез',     fallback: 'Анамнез не указан' },
    { key: 'объективно',  label: 'Объективно',  fallback: 'Объективные данные не указаны' },
    { key: 'диагноз',     label: 'Диагноз',     fallback: 'Диагноз не установлен', withMkb: true },
    { key: 'рекомендации',label: 'Рекомендации',fallback: 'Рекомендации не указаны' },
    { key: 'назначения',  label: 'Назначения',  fallback: 'Назначения не указаны' },
  ];

  const lines = [];

  for (const section of SECTIONS) {
    const data = medCard[section.key];
    const text = data?.текст;
    const isEmpty = !text || text.trim() === '' || text === 'Не указано в ходе приёма';
    const displayText = isEmpty ? section.fallback : text.trim();

    let line = `${section.label}: ${displayText}`;

    if (section.withMkb && data?.мкб10 && !isEmpty) {
      line += `\nМКБ-10: ${data.мкб10}`;
    }

    lines.push(line);
  }

  return lines.join('\n\n');
}

// ════════════════════════════════════════════════════════════
// ОСНОВНАЯ ФУНКЦИЯ ЗАПОЛНЕНИЯ — СНАЙПЕРСКИЙ ВВОД
// ════════════════════════════════════════════════════════════

/**
 * fillMISForm(medCard, duration)
 *
 * ЛОГИКА ПОЛЯ «Прием:»:
 * - Если Groq вернул тип_приема = "Первичный" или "Повторный" → заполняем
 * - Если null (не упомянуто в диалоге) → молча пропускаем, total уменьшается
 * - Никакой ошибки в UI, просто не трогаем это поле
 */
async function fillMISForm(medCard, duration) {
  showOverlay('⏳ Заполняю поле «Содержание»...', 'info');
  await delay(300);

  const total   = 1;
  let filled    = 0;
  const skipped = [];

  // ── Только «Содержание» ───────────────────────────────────
  showOverlay('🎯 Заполняю поле «Содержание»...', 'info');

  const editor = findLargestEditor();

  if (editor) {
    const fullText = buildContentText(medCard);
    const ok = set1CValue(editor.el, fullText);

    if (ok) {
      filled++;
      if (editor.type !== 'iframe') highlightField(editor.el);
      console.log(`[MediQaz] ✅ Содержание заполнено (тип: ${editor.type}, площадь: ${Math.round(editor.area)}px²)`);
    } else {
      skipped.push('Содержание (ошибка set1CValue)');
      console.warn('[MediQaz] ⚠️ Содержание: set1CValue вернул false');
    }
  } else {
    skipped.push('Содержание (редактор не найден)');
    console.warn('[MediQaz] ⚠️ Большой редактор «Содержание» не найден');
  }

  await delay(200);

  // ── Итог ─────────────────────────────────────────────────
  if (filled === total) {
    showOverlay(`✅ Заполнено ${filled}/${total} полей МИС`, 'success', 7000);
  } else if (filled > 0) {
    const skippedList = skipped.join('; ');
    showOverlay(`⚠️ Заполнено ${filled}/${total} полей. Пропущено: ${skippedList}`, 'error', 8000);
  } else {
    showOverlay(`❌ Не удалось заполнить ни одного поля. Откройте форму приёма в 1С.`, 'error', 8000);
  }

  console.log(`[MediQaz] Итог: заполнено ${filled}/${total}. Пропущено:`, skipped);
  return { filled, total, skipped };
}

// ─── Утилита: задержка ──────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════
// OVERLAY УВЕДОМЛЕНИЕ НА СТРАНИЦЕ 1С
// ════════════════════════════════════════════════════════════

function showOverlay(message, type = 'info', duration = 5000) {
  const existing = document.getElementById('mediqaz-overlay');
  if (existing) existing.remove();

  const colors = { info: '#2563EB', success: '#059669', error: '#DC2626' };
  const icons  = { info: '🩺', success: '✅', error: '⚠️' };

  if (!document.getElementById('mediqaz-styles')) {
    const style = document.createElement('style');
    style.id = 'mediqaz-styles';
    style.textContent = `
      @keyframes mediqaz-slide-in {
        from { opacity: 0; transform: translateX(40px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes mediqaz-slide-out {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(40px); }
      }
      @keyframes mediqaz-progress {
        from { width: 100%; }
        to   { width: 0%; }
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'mediqaz-overlay';
  overlay.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    background: ${colors[type] || colors.info}; color: white;
    padding: 14px 18px 18px; border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px; font-weight: 500;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    display: flex; align-items: center; gap: 10px;
    max-width: 380px; min-width: 200px;
    animation: mediqaz-slide-in 0.3s ease;
    cursor: pointer; overflow: hidden;
  `;

  overlay.innerHTML = `
    <span style="font-size:18px;flex-shrink:0">${icons[type] || icons.info}</span>
    <span style="flex:1">${message}</span>
    <button id="mediqaz-overlay-close" style="
      background:none;border:none;color:rgba(255,255,255,0.7);
      cursor:pointer;font-size:14px;padding:0;margin-left:4px;flex-shrink:0;">✕</button>
    <div style="
      position:absolute;bottom:0;left:0;height:3px;
      background:rgba(255,255,255,0.4);border-radius:0 0 12px 12px;
      animation:mediqaz-progress ${duration}ms linear forwards;"></div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.style.animation = 'mediqaz-slide-out 0.25s ease forwards';
    setTimeout(() => overlay.remove(), 250);
  };

  document.getElementById('mediqaz-overlay-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target.id !== 'mediqaz-overlay-close') close();
  });

  setTimeout(close, duration);
}


} // end if (!window.__mediqazContentLoaded)

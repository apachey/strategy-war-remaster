# Shardfall: як встановити

Фанатський ремайстер мобільної стратегії Strategy War (Jiří Mikula, 2004) для Mac. Безкоштовно, для друзів.

**Потрібно:** будь-який Mac (Apple Silicon або Intel) з macOS 12 Monterey чи новішою. Для гри вдвох знадобиться
геймпад (Xbox чи PlayStation, підключений через Bluetooth або кабель).

## Встановлення

1. Відкрий файл `Shardfall-….dmg` (його можна отримати від друга або завантажити зі сторінки релізу).
2. У вікні, що відкрилося, перетягни **Shardfall** у папку **Applications**.
3. Закрий вікно й витягни диск (значок у Finder → Eject).

## Перший запуск

Гра не підписана сертифікатом Apple (це платно), тому macOS один раз попросить підтвердження.

**macOS 15 Sequoia і новіші**

1. Відкрий **Applications** і двічі клацни **Shardfall**. З'явиться вікно, що програму не вдалося відкрити; натисни **Готово** (Done).
2. Відкрий **Системні параметри → Приватність і безпека**, прокрути вниз до розділу **Безпека**.
3. Біля рядка про Shardfall натисни **Усе одно відкрити** (Open Anyway) і підтверди паролем або Touch ID.
4. У наступному вікні натисни **Відкрити**. Далі гра запускається як звичайна програма.

**macOS 12–14**

1. У папці **Applications** клацни **Shardfall** правою кнопкою (або з Control) і вибери **Відкрити**.
2. У вікні з попередженням натисни **Відкрити**.

**Якщо macOS пише, що програму "пошкоджено"**, відкрий **Термінал** і виконай:

```sh
xattr -cr "/Applications/Shardfall.app"
```

Потім запусти гру ще раз.

## Як грати

- **Кампанія:** 21 місія оригіналу. Мета кожної: знищити ворожий штаб і зберегти свій.
- **Скірміш:** будь-яка з 7 мап проти комп'ютера або вдвох за одним Mac (екран ділиться навпіл, другий гравець з геймпадом).
- **Миша:** ліва кнопка вибирає (рамкою кілька танків), права дає наказ: їхати, атакувати, збирати кристали.
- **Клавіші:** Cmd+1…9 запам'ятати загін, 1…9 вибрати · H штаб · S стоп · Пробіл пауза · колесо або +/− зум ·
  F уся мапа · F5/F9 швидке збереження й завантаження. Мінікарта у правому верхньому куті: клацни, щоб перейти.
- **⚙ Налаштування:** гучність музики та звуків, мова (українська або англійська).

Збереження й пройдені місії зберігаються на твоєму Mac. Щоб видалити гру, перетягни її з Applications у Кошик.

---

# Shardfall: how to install

A fan remaster of the mobile strategy game Strategy War (Jiří Mikula, 2004) for the Mac. Free, for friends.

**You need:** any Mac (Apple Silicon or Intel) with macOS 12 Monterey or later. Two-player games need a gamepad
(Xbox or PlayStation, over Bluetooth or a cable).

## Install

1. Open `Shardfall-….dmg` (from a friend, or from the release page).
2. Drag **Shardfall** into the **Applications** folder.
3. Close the window and eject the disk image.

## First launch

The game is not signed with an Apple certificate (that costs money), so macOS asks you to confirm once.

**macOS 15 Sequoia and later**

1. Open **Applications** and double-click **Shardfall**. A "Not Opened" window appears; click **Done**.
2. Open **System Settings → Privacy & Security** and scroll down to **Security**.
3. Next to the line about Shardfall click **Open Anyway** and confirm with your password or Touch ID.
4. Click **Open** in the next window. From then on the game starts like any other app.

**macOS 12–14**

1. In **Applications**, right-click (or Control-click) **Shardfall** and choose **Open**.
2. Click **Open** in the warning.

**If macOS says the app "is damaged"**, open **Terminal** and run:

```sh
xattr -cr "/Applications/Shardfall.app"
```

Then start the game again.

## How to play

- **Campaign:** the original's 21 missions. Destroy the enemy HQ and keep your own.
- **Skirmish:** any of the 7 maps against the computer, or two players on one Mac (split screen, player 2 on a gamepad).
- **Mouse:** left button selects (drag a box for several tanks), right button orders: move, attack, harvest crystals.
- **Keys:** Cmd+1…9 store a group, 1…9 recall it · H HQ · S stop · Space pause · wheel or +/− zoom · F whole map ·
  F5/F9 quick save and load. The minimap is in the top right corner: click it to jump there.
- **⚙ Settings:** music and sound volume, language (Ukrainian or English).

Saves and finished missions stay on your Mac. To remove the game, drag it from Applications to the Bin.

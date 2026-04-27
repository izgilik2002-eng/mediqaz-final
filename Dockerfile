FROM node:20-bullseye-slim

# Установка зависимостей для компиляции SQLite (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Создаем директорию приложения
WORKDIR /app

# Копируем package.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --omit=dev

# Копируем исходный код
COPY . .

# Создаём папку для БД и даем права (на случай если используется DB_PATH=/app/data/...)
RUN mkdir -p /app/data && chmod 777 /app/data

# Открываем порт HTTP сервера
EXPOSE 3000

# Запускаем приложение (пока от root, чтобы не было конфликтов с правами на существующую БД)
CMD ["npm", "start"]

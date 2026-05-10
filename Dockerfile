# Menggunakan versi slim yang lebih stabil untuk Prisma
FROM node:20-slim

# Install OpenSSL secara otomatis
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# 1. Salin file manajemen paket
COPY package*.json ./
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 2. Install dependencies
RUN npm install

# 3. Salin seluruh kode proyek DeliverIQ
COPY . .

# 4. Cari & Generate Prisma secara otomatis
# Perintah ini akan mencari di mana pun file schema.prisma berada agar tidak error 'Path Not Found'
RUN SCHEMA_PATH=$(find . -name "schema.prisma" | head -n 1) && \
    echo "Menggunakan schema di: $SCHEMA_PATH" && \
    npx prisma generate --schema=$SCHEMA_PATH

# 5. Build sistem (Frontend & Backend)
RUN npm run build:frontend && npm run build:backend

EXPOSE 8080

# 6. Jalankan layanan
CMD ["npm", "run", "dev:backend"]

FROM node:20-alpine

# 1. Install OpenSSL (WAJIB untuk Prisma agar bisa berjalan di Alpine Linux)
RUN apk add --no-cache openssl

WORKDIR /app

# 2. Salin konfigurasi utama monorepo
COPY package*.json ./
# Salin package.json tiap bagian agar instalasi npm lebih cepat
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 3. Install semua dependencies
RUN npm install

# 4. Salin seluruh kode sumber proyek DeliverIQ
COPY . .

# 5. Jalankan Prisma Generate
# Kami menggunakan path src/backend/src/db/schema.prisma sesuai struktur folder Anda
RUN npx prisma generate --schema=src/backend/src/db/schema.prisma

# 6. Build aplikasi menggunakan skrip yang ada di package.json root
RUN npm run build:frontend && npm run build:backend

EXPOSE 8080

# 7. Jalankan backend sebagai layanan utama
CMD ["npm", "run", "dev:backend"]

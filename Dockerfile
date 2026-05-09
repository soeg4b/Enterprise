FROM node:20-alpine
WORKDIR /app

# 1. Salin file konfigurasi utama
COPY package*.json ./

# 2. Salin package.json dari masing-masing folder (sesuai struktur src/ di GitHub Anda)
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 3. Install dependencies
RUN npm install

# 4. Salin seluruh sisa kode
COPY . .

# 5. Generate Prisma (Sesuaikan path schema jika berbeda)
RUN npx prisma generate --schema=src/backend/src/db/schema.prisma

# 6. Build aplikasi
RUN npm run build:frontend && npm run build:backend

EXPOSE 8080

# 7. Jalankan backend
CMD ["npm", "run", "dev:backend"]

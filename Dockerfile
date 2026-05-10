# 1. Menggunakan versi 'slim' agar lebih stabil dengan Prisma dan OpenSSL
FROM node:20-slim

# 2. Install OpenSSL secara eksplisit (Wajib untuk Prisma)
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# 3. Salin file manajemen paket monorepo
COPY package*.json ./
# Salin package.json di sub-folder agar proses 'npm install' lebih cepat
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 4. Install semua dependencies (termasuk Prisma)
RUN npm install

# 5. Salin seluruh kode proyek DeliverIQ ke dalam mesin perakit
COPY . .

# 6. JALAN PINTAS: Mencari file schema.prisma secara otomatis
# Perintah ini akan mencari di mana pun file tersebut berada, 
# jadi Bapak tidak perlu pusing memikirkan path yang salah.
RUN SCHEMA_PATH=$(find . -name "schema.prisma" | head -n 1) && \
    echo "Menemukan schema di: $SCHEMA_PATH" && \
    npx prisma generate --schema=$SCHEMA_PATH

# 7. Build dashboard Frontend dan mesin Backend
RUN npm run build:frontend && npm run build:backend

# 8. Set port standar Cloud Run
EXPOSE 8080

# 9. Jalankan layanan backend
CMD ["npm", "run", "dev:backend"]

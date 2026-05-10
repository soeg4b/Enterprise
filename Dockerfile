# 1. Gunakan versi 'slim' (Debian) agar lebih stabil dengan Prisma dan OpenSSL
FROM node:20-slim

# 2. Install library keamanan yang diwajibkan oleh Prisma
RUN apt-get update -y && apt-get install -y openssl findutils

WORKDIR /app

# 3. Salin file manajemen paket monorepo
COPY package*.json ./
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 4. Install dependencies bersih di lingkungan cloud
RUN npm install

# 5. Salin seluruh kode sumber proyek
COPY . .

# 6. AUTO-DETECT: Mencari lokasi schema.prisma secara otomatis
# Perintah ini akan mencari di mana pun file tersebut berada di dalam folder proyek
RUN SCHEMA_PATH=$(find . -name "schema.prisma" | head -n 1) && \
    echo "Menemukan schema di: $SCHEMA_PATH" && \
    npx prisma generate --schema=$SCHEMA_PATH

# 7. Build dashboard (Frontend) dan mesin (Backend)
RUN npm run build:frontend && npm run build:backend

EXPOSE 8080

# 8. Jalankan aplikasi
CMD ["npm", "run", "dev:backend"]

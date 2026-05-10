# 1. Gunakan 'slim' untuk kompatibilitas OpenSSL yang lebih baik
FROM node:20-slim

# 2. Install library keamanan yang dibutuhkan Prisma
RUN apt-get update -y && apt-get install -y openssl findutils

WORKDIR /app

# 3. Salin manajemen paket
COPY package*.json ./
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 4. Install dependencies bersih di lingkungan cloud
RUN npm install

# 5. Salin kode sumber
COPY . .

# 6. AUTO-DETECT: Mencari lokasi schema.prisma secara otomatis
# Agar tidak error 'file or directory not found' lagi
RUN SCHEMA_PATH=$(find . -name "schema.prisma" | head -n 1) && \
    echo "Schema ditemukan di: $SCHEMA_PATH" && \
    npx prisma generate --schema=$SCHEMA_PATH

# 7. Build Frontend dan Backend
RUN npm run build:frontend && npm run build:backend

EXPOSE 8080

# 8. Jalankan aplikasi
CMD ["npm", "run", "dev:backend"]

# 1. Gunakan 'slim' (Debian) agar OpenSSL sudah tersedia dan stabil
FROM node:20-slim

# 2. Update library keamanan sistem
RUN apt-get update -y && apt-get install -y openssl findutils

WORKDIR /app

# 3. Salin file manajemen paket (Optimization)
COPY package*.json ./
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 4. Install dependencies bersih
RUN npm install

# 5. Salin seluruh kode sumber proyek DeliverIQ
COPY . .

# 6. JALUR OTOMATIS: Mencari lokasi schema.prisma sendiri
# Ini akan mengatasi error 'file or directory not found' selamanya
RUN SCHEMA_PATH=$(find . -name "schema.prisma" | head -n 1) && \
    echo "Menemukan schema di: $SCHEMA_PATH" && \
    npx prisma generate --schema=$SCHEMA_PATH

# 7. Build sistem (Frontend & Backend)
RUN npm run build:frontend && npm run build:backend

EXPOSE 8080

# 8. Jalankan layanan utama
CMD ["npm", "run", "dev:backend"]

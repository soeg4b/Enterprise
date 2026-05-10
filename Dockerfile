# =============================================================================
# DeliverIQ — Production Monorepo Dockerfile
# =============================================================================

# 1. Gunakan node:20-slim untuk efisiensi ukuran image
FROM node:20-slim

# 2. Install dependencies sistem yang dibutuhkan Prisma & OpenSSL
RUN apt-get update -y && apt-get install -y openssl findutils

WORKDIR /app

# 3. Optimization: Salin file package.json terlebih dahulu agar cache 'npm install' awet
COPY package*.json ./
COPY src/backend/package*.json ./src/backend/
COPY src/frontend/package*.json ./src/frontend/

# 4. Install dependencies proyek
RUN npm install

# 5. Salin seluruh kode sumber
COPY . .

# 6. BINDING API URL (SOLUSI ERROR LOCALHOST)
# ARG ini akan menangkap variabel dari Cloud Build Substitution
ARG _NEXT_PUBLIC_API_URL
# ENV ini akan "membakar" URL tersebut ke dalam file JavaScript Next.js saat build
ENV NEXT_PUBLIC_API_URL=$_NEXT_PUBLIC_API_URL

# 7. Generasi Prisma Client (Menjamin sinkronisasi database)
RUN SCHEMA_PATH=$(find . -name "schema.prisma" | head -n 1) && \
    echo "Prisma Schema ditemukan di: $SCHEMA_PATH" && \
    npx prisma generate --schema=$SCHEMA_PATH

# 8. Proses Rakit (Build)
# Tahap ini krusial: Next.js akan membaca ENV NEXT_PUBLIC_API_URL di sini
RUN npm run build:frontend && npm run build:backend

# 9. Ekspos Port standar Cloud Run
EXPOSE 8080

# 10. Perintah Menyalakan (Default ke Backend)
# CATATAN: Untuk layanan 'enterprise-frontend', perintah ini akan dioverride 
# di Cloud Run UI menggunakan: npm run start -w deliveriq-frontend -- -p 8080
CMD ["npm", "run", "start", "-w", "deliveriq-backend"]

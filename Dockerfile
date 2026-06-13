FROM node:20-alpine AS base

# تثبيت اعتماديات Prisma
RUN apk add --no-cache openssl

FROM base AS builder
WORKDIR /app

# نسخ ملفات المشروع
COPY package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# تثبيت الاعتماديات
RUN npm ci

# نسخ الكود
COPY . .

# توليد Prisma Client
RUN cd apps/web && npx prisma generate

# بناء المشروع
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/prisma ./apps/web/prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "run", "start", "--prefix", "apps/web"]

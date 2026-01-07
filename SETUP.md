# Setup Guide - Tukaanle PWA

## Prerequisites

1. **Node.js** 18+ installed
2. **MySQL** server running (5.7+ or 8.0+)
3. **npm** or **yarn** package manager

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your MySQL credentials:

```env
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=tukaanle
DB_USERNAME=root
DB_PASSWORD=your_mysql_password
```

**Important**: 
- Create the database in MySQL first: `CREATE DATABASE tukaanle;`
- Use a strong `JWT_SECRET` (minimum 32 characters) for production
- Never commit `.env` file (it's in `.gitignore`)

### 3. Database Setup

Push the schema to MySQL:

```bash
npm run db:push
```

Generate Prisma Client:

```bash
npm run db:generate
```

### 4. Seed Initial Data

Create system owner account:

```bash
npm run db:seed
```

This creates:
- System configuration (status: ACTIVE)
- System owner user:
  - Phone: `252612345678`
  - Password: `admin123`
  - Role: OWNER

**Change these credentials immediately in production!**

### 5. Verify Installation

Start the development server:

```bash
npm run dev
```

Check the health endpoint:

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "api": "ok",
  "database": "connected",
  "timestamp": "2024-..."
}
```

### 6. Access the Application

Open your browser:
- URL: http://localhost:3000
- Login with seeded credentials

## Troubleshooting

### Database Connection Errors

1. Verify MySQL is running:
   ```bash
   mysql -u root -p -e "SELECT 1;"
   ```

2. Check database exists:
   ```bash
   mysql -u root -p -e "SHOW DATABASES LIKE 'tukaanle';"
   ```

3. Verify credentials in `.env` match your MySQL setup

4. Check firewall/network if connecting to remote MySQL

### Prisma Errors

1. Ensure database exists before running `db:push`
2. Check user has CREATE, ALTER, DROP privileges
3. Run `npm run db:generate` after schema changes

### Port Already in Use

If port 3000 is busy, set a different port:
```env
PORT=3001
```

Then access: http://localhost:3001

## Production Checklist

- [ ] Change default system owner password
- [ ] Use strong JWT_SECRET (32+ characters)
- [ ] Set APP_ENV=production
- [ ] Configure secure MySQL user (not root)
- [ ] Enable HTTPS
- [ ] Set up proper logging
- [ ] Configure backup strategy
- [ ] Review security settings
- [ ] Test health endpoint
- [ ] Verify error handling

## Security Notes

1. **Never** commit `.env` file
2. Use strong passwords for database and JWT
3. Limit MySQL user privileges
4. Enable SSL for MySQL in production
5. Use environment-specific configurations
6. Regularly update dependencies
7. Monitor audit logs


import { query } from '../src/db';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from root .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const seedUser = async () => {
    console.log('Seeding Standard User...');
    const email = 'test@tryk.app';
    const password = 'Password123!';
    
    try {
        const check = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (check.rows.length > 0) {
            console.log('Test user already exists. Updating password...');
            const hashedPassword = await bcrypt.hash(password, 10);
            await query("UPDATE users SET password_hash = $1 WHERE email = $2", [hashedPassword, email]);
            console.log('Done.');
            process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
            `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Test User', 'user')`,
            [email, hashedPassword]
        );
        console.log('Test user created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding user:', error);
        process.exit(1);
    }
};

seedUser();

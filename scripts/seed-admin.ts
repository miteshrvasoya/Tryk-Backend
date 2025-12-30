import { query } from '../src/db';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from root .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const seedAdmin = async () => {
    console.log('Seeding Admin User...');
    const email = 'admin@tryk.app';
    const password = 'Tryk123!@'; // Default password from login page
    
    try {
        const check = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (check.rows.length > 0) {
            console.log('Admin user already exists. Updating role to admin...');
            await query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
            console.log('Done.');
            process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
            `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Tryk Admin', 'admin')`,
            [email, hashedPassword]
        );
        console.log('Admin user created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
};

seedAdmin();

import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const backupDir = path.resolve(__dirname, '../backup'); // Make sure this folder exists

export const createBackup = (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `neondb_backup_${timestamp}.dump`;
  const filePath = path.join(backupDir, fileName);

  // Command to run pg_dump (adjust path and connection string)
  // Replace with your actual connection string or pg_dump params
  const pgDumpCommand = `pg_dump "postgresql://neondb_owner:npg_tZOvfMQ7a3qJ@ep-purple-mountain-a4qsw8mu-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require" -Fc -f ${filePath}`;

  exec(pgDumpCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('Backup error:', error);
      return res.status(500).json({ message: 'Backup failed' });
    }

    // After successful dump, send file as download
    res.download(filePath, fileName, (err) => {
      if (err) console.error('Error sending file:', err);

      // Optional: Delete file after sending
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
      });
    });
  });
};

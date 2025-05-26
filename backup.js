const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const backupDir = path.resolve(__dirname, '../backups'); // make sure this folder exists

const createBackup = (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `neondb_backup_${timestamp}.dump`;
  const filePath = path.join(backupDir, fileName);

  const pgDumpCommand = `pg_dump "postgresql://neondb_owner:npg_tZOvfMQ7a3qJ@ep-purple-mountain-a4qsw8mu-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require" -Fc -f ${filePath}`;

  exec(pgDumpCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('Backup error:', error);
      return res.status(500).json({ message: 'Backup failed' });
    }

    res.download(filePath, fileName, (err) => {
      if (err) console.error('Error sending file:', err);

      // Delete the backup file after sending to client
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
      });
    });
  });
};

module.exports = createBackup;

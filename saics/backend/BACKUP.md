# Database backup and restore

Backups contain student information and password hashes. Keep both the local
backup directory and any off-machine copy private. The application never
includes backup contents in logs or API responses.

## Configure XAMPP

In `saics/backend/.env`, set the database connection values used by the
application and optionally configure:

```dotenv
MYSQLDUMP_PATH=C:\xampp\mysql\bin\mysqldump.exe
MYSQL_PATH=C:\xampp\mysql\bin\mysql.exe
BACKUP_DIR=./backups
BACKUP_COPY_DIR=C:\Users\your-name\OneDrive\AcadanceBackups
BACKUP_CRON=02:00
BACKUP_GZIP=false
```

`MYSQLDUMP_PATH` and `MYSQL_PATH` default to their XAMPP paths above.
`BACKUP_DIR` defaults to `./backups` under the backend working directory.
Set `BACKUP_COPY_DIR` to a separate drive or a folder synchronized by
OneDrive/Google Drive for off-machine protection. If it is unset, local
backups still work, but the admin page warns that there is no off-machine
copy. `BACKUP_CRON` is a daily local-server time in 24-hour `HH:MM` format.
`BACKUP_GZIP=true` enables gzip compression.

Start the backend normally. It schedules one backup per day while running.
The schedule does not perform an extra backup during server shutdown. Backups
use a consistent InnoDB snapshot and include routines, triggers, and events.
The application retains backups from the latest 14 distinct backup dates in
`BACKUP_DIR`; retention never deletes files from `BACKUP_COPY_DIR`.

## Run and inspect a backup

1. Start MySQL in the XAMPP Control Panel and start the Acadance backend.
2. Sign in as an administrator and open **Admin → Backups**.
3. Select **Backup now** and wait for the result. A local dump and its SHA-256
   checksum are written in `BACKUP_DIR`. Any off-machine copy error is shown
   separately and does not invalidate the local dump.
4. Confirm the new row shows a valid checksum and, when configured, an
   off-machine copy.
5. To verify independently in PowerShell, from `saics\backend` run:

   ```powershell
   Get-FileHash .\backups\saics_db_YYYYMMDD_HHmmss.sql -Algorithm SHA256
   Get-Content .\backups\saics_db_YYYYMMDD_HHmmss.sql.sha256
   ```

   Use the actual filename from the admin table. If gzip is enabled, include
   `.gz` in the file name passed to `Get-FileHash`.

## Restore a backup

Restore is a command-line-only operation. It replaces the selected database's
contents with the dump and should be tested against a disposable database
first. Stop the backend and other applications that write to the target
database before restoring.

1. In the XAMPP Control Panel, start MySQL and create/select the intended
   target database in phpMyAdmin. Confirm `DB_NAME` in `saics/backend/.env`
   points to that database. The restore script does not create the database.
2. From a PowerShell terminal, enter:

   ```powershell
   Set-Location C:\Users\your-name\Documents\GitHub\Acadance-\saics\backend
   npm run restore:backup -- saics_db_YYYYMMDD_HHmmss.sql
   ```

   If `BACKUP_GZIP=true`, provide the actual `.sql.gz` filename instead.
3. Read the displayed target database name. Type exactly `RESTORE` when
   prompted. Any other input cancels the operation.
4. In production, the script refuses to run unless explicitly forced. Only
   after verifying the target database and chosen file, run:

   ```powershell
   npm run restore:backup -- saics_db_YYYYMMDD_HHmmss.sql --force
   ```

   `--force` does not bypass the typed `RESTORE` confirmation.
5. Restart the backend and verify the restored data in the application.
   Keep an independent backup before performing a real restore.

The restore script accepts only a backup filename from `BACKUP_DIR`, checks
its SHA-256 checksum, and never accepts an arbitrary file path. Database
passwords are supplied to the MySQL child process through its environment,
not through command-line arguments.

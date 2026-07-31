const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function checkFolderDetails() {
  console.log('=== Checking Folder 1kwg4QNsc22__I63VSC6hVq3TFMp5WPD9 (User URL) ===');
  try {
    const f1 = await drive.files.get({ fileId: '1kwg4QNsc22__I63VSC6hVq3TFMp5WPD9', fields: 'id, name, parents' });
    console.log('User Folder:', f1.data);
    const files1 = await drive.files.list({ q: "'1kwg4QNsc22__I63VSC6hVq3TFMp5WPD9' in parents and trashed=false", fields: 'files(id, name)' });
    console.log(`Files inside 1kwg4QNsc22__I63VSC6hVq3TFMp5WPD9: ${files1.data.files.length}`);
    files1.data.files.forEach(f => console.log(' - ' + f.name));
  } catch (err) {
    console.error('Error checking user folder:', err.message);
  }

  console.log('\n=== Checking Folder 1jsx2LMhNUh_kVIBYcoGXAHMAwydv6Of6 (Where Milliyang files were found) ===');
  try {
    const f2 = await drive.files.get({ fileId: '1jsx2LMhNUh_kVIBYcoGXAHMAwydv6Of6', fields: 'id, name, parents' });
    console.log('Milyang Parent Folder:', f2.data);
    const files2 = await drive.files.list({ q: "'1jsx2LMhNUh_kVIBYcoGXAHMAwydv6Of6' in parents and trashed=false", fields: 'files(id, name)' });
    console.log(`Files inside 1jsx2LMhNUh_kVIBYcoGXAHMAwydv6Of6: ${files2.data.files.length}`);
  } catch (err) {
    console.error('Error checking Milyang folder:', err.message);
  }
}

checkFolderDetails().catch(console.error);

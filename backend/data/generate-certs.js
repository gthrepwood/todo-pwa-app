const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

const attrs = [{ name: 'commonName', value: 'localhost' }];

selfsigned.generate(attrs, { days: 365, keySize: 2048 }).then(pems => {
  const dataDir = path.join(__dirname);
  fs.writeFileSync(path.join(dataDir, 'key.pem'), pems.private);
  fs.writeFileSync(path.join(dataDir, 'cert.pem'), pems.cert);
  console.log('SSL certificates generated successfully!');
}).catch(err => {
  console.error('Error generating certificates:', err);
});

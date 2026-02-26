// Compression test for Todo PWA
// Tests that JavaScript files are served with gzip compression

const http = require('http');

const SERVER = 'http://localhost:3004';

// Files to test for compression
const TEST_FILES = [
  '/app.js',
  '/service-worker.js'
];

async function testCompression() {
  console.log('🧪 Testing GZIP compression for JavaScript files\n');
  
  for (const file of TEST_FILES) {
    await testFileCompression(file);
  }
}

function testFileCompression(filePath) {
  return new Promise((resolve) => {
    console.log(`📄 Testing: ${filePath}`);
    
    const options = {
      hostname: 'localhost',
      port: 3004,
      path: filePath,
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate, br'
      }
    };

    const req = http.request(options, (res) => {
      const encoding = res.headers['content-encoding'];
      const contentLength = res.headers['content-length'];
      const contentType = res.headers['content-type'];
      
      let data = [];
      
      res.on('data', (chunk) => {
        data.push(chunk);
      });
      
      res.on('end', () => {
        const totalSize = Buffer.concat(data).length;
        
        console.log(`   Content-Type: ${contentType}`);
        console.log(`   Content-Encoding: ${encoding || 'none'}`);
        console.log(`   Transfer size: ${totalSize} bytes`);
        
        if (encoding && (encoding.includes('gzip') || encoding.includes('deflate') || encoding.includes('br'))) {
          console.log(`   ✅ PASS - File is compressed with ${encoding}\n`);
        } else {
          console.log(`   ❌ FAIL - File is NOT compressed\n`);
        }
        
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`   ❌ ERROR - ${err.message}`);
      if (err.code === 'ECONNREFUSED') {
        console.log('   → Is the server running on port 3004?');
      }
      resolve();
    });
    
    req.end();
  });
}

testCompression();
